// Server-only persistence of collaborative Yjs documents in Postgres:
//   collab_doc     one merged state per key (compacted history)
//   collab_update  incremental updates since the last compaction, plus
//                  awareness rows under `aw:<key>` (same id sequence, so one
//                  `after` cursor serves both; pruned after 60 s)
// No transactions beyond neon-http batches: the seed insert and the
// compaction swap are guarded in SQL instead.

import { and, asc, count, eq, exists, gt, inArray, lt, max, or, sql } from 'drizzle-orm';
import * as Y from 'yjs';

import { collabDocs, collabUpdates } from '@/db/schema';
import { db } from '@/lib/db';
import { awarenessKey, fromBase64, toBase64, type CollabRow } from './codec';

const AWARENESS_TTL_MS = 60_000;
/** Awareness rows included in a full sync (someone idle longer has expired anyway). */
const AWARENESS_RECENT_MS = 30_000;
const COMPACT_THRESHOLD = 200;
/** Only compact rows every live client has long since seen (clients resync after 45 s gaps). */
const COMPACT_MIN_AGE_MS = 120_000;

export interface FullState {
  /** Merged update (base64); empty doc when nothing was ever written. */
  update: string;
  lastId: number;
  empty: boolean;
  awareness: CollabRow[];
}

/** Everything known about `key`, as a diff against the client's state vector. */
export async function readFullState(key: string, stateVector: Uint8Array | null): Promise<FullState> {
  const since = new Date(Date.now() - AWARENESS_RECENT_MS);
  // One batch = one snapshot: the id head matches exactly the rows merged here.
  const [docRows, updateRows, awarenessRows, headRows] = await db.batch([
    db.select({ state: collabDocs.stateBase64 }).from(collabDocs).where(eq(collabDocs.key, key)).limit(1),
    db
      .select({ u: collabUpdates.updateBase64 })
      .from(collabUpdates)
      .where(eq(collabUpdates.key, key))
      .orderBy(asc(collabUpdates.id)),
    db
      .select({ id: collabUpdates.id, u: collabUpdates.updateBase64 })
      .from(collabUpdates)
      .where(and(eq(collabUpdates.key, awarenessKey(key)), gt(collabUpdates.createdAt, since)))
      .orderBy(asc(collabUpdates.id)),
    db.select({ id: max(collabUpdates.id) }).from(collabUpdates),
  ]);

  const parts: Uint8Array[] = [];
  if (docRows[0]) parts.push(fromBase64(docRows[0].state));
  for (const row of updateRows) parts.push(fromBase64(row.u));
  const empty = parts.length === 0;
  const merged = empty ? Y.encodeStateAsUpdate(new Y.Doc()) : parts.length === 1 ? parts[0] : Y.mergeUpdates(parts);
  const update = stateVector ? Y.diffUpdate(merged, stateVector) : merged;
  // Polling resumes from the global head (ids only grow, shared by all keys).
  const lastId = headRows[0]?.id ?? 0;
  return { update: toBase64(update), lastId, empty, awareness: awarenessRows };
}

/** Rows newer than `after` for the key and its awareness channel, excluding the caller's own. */
export async function readRowsAfter(
  key: string,
  after: number,
  exceptClient: string | null,
): Promise<{ updates: CollabRow[]; awareness: CollabRow[]; lastId: number }> {
  const rows = await db
    .select({ id: collabUpdates.id, key: collabUpdates.key, u: collabUpdates.updateBase64, client: collabUpdates.clientId })
    .from(collabUpdates)
    .where(and(inArray(collabUpdates.key, [key, awarenessKey(key)]), gt(collabUpdates.id, after)))
    .orderBy(asc(collabUpdates.id))
    .limit(500);

  const updates: CollabRow[] = [];
  const awareness: CollabRow[] = [];
  let lastId = after;
  for (const row of rows) {
    lastId = Math.max(lastId, row.id);
    if (exceptClient && row.client === exceptClient) continue;
    (row.key === key ? updates : awareness).push({ id: row.id, u: row.u });
  }
  return { updates, awareness, lastId };
}

export async function appendUpdate(key: string, update: string, clientId: string): Promise<number> {
  const [row] = await db
    .insert(collabUpdates)
    .values({ key, updateBase64: update, clientId, createdAt: new Date() })
    .returning({ id: collabUpdates.id });
  return row.id;
}

export async function appendAwareness(key: string, update: string, clientId: string): Promise<number> {
  const aw = awarenessKey(key);
  const [inserted] = await db.batch([
    db
      .insert(collabUpdates)
      .values({ key: aw, updateBase64: update, clientId, createdAt: new Date() })
      .returning({ id: collabUpdates.id }),
    db
      .delete(collabUpdates)
      .where(and(eq(collabUpdates.key, aw), lt(collabUpdates.createdAt, new Date(Date.now() - AWARENESS_TTL_MS)))),
  ]);
  return inserted[0].id;
}

/** Stores the initial state only while the key has none; false when someone else got there first. */
export async function seedState(key: string, update: string): Promise<boolean> {
  const now = new Date();
  const rows = await db.execute<{ key: string }>(sql`
    insert into ${collabDocs} (key, state_base64, updated_at)
    select ${key}, ${update}, ${now.toISOString()}::timestamp
    where not exists (select 1 from ${collabUpdates} where ${collabUpdates.key} = ${key})
    on conflict (key) do nothing
    returning key
  `);
  return rows.rows.length > 0;
}

/**
 * Folds old updates into collab_doc once there are many. The doc write is a
 * compare-and-set on updated_at and the delete only runs if that write landed
 * (same batch), so concurrent compactions can't drop each other's rows.
 */
export async function maybeCompact(key: string): Promise<void> {
  const cutoff = new Date(Date.now() - COMPACT_MIN_AGE_MS);
  const [{ n }] = await db
    .select({ n: count() })
    .from(collabUpdates)
    .where(and(eq(collabUpdates.key, key), lt(collabUpdates.createdAt, cutoff)));
  if (n <= COMPACT_THRESHOLD) return;

  const [docRows, rows] = await db.batch([
    db
      .select({ state: collabDocs.stateBase64, updatedAt: collabDocs.updatedAt })
      .from(collabDocs)
      .where(eq(collabDocs.key, key))
      .limit(1),
    db
      .select({ id: collabUpdates.id, u: collabUpdates.updateBase64 })
      .from(collabUpdates)
      .where(and(eq(collabUpdates.key, key), lt(collabUpdates.createdAt, cutoff)))
      .orderBy(asc(collabUpdates.id)),
  ]);
  if (rows.length === 0) return;

  const doc = docRows[0];
  const parts = [...(doc ? [fromBase64(doc.state)] : []), ...rows.map((r) => fromBase64(r.u))];
  const state = toBase64(Y.mergeUpdates(parts));
  const ids = rows.map((r) => r.id);
  // Unique per compaction so the delete below can tell whether our write won.
  const stamp = new Date(Math.max(Date.now(), (doc?.updatedAt.getTime() ?? 0) + 1));

  const write = doc
    ? db
        .update(collabDocs)
        .set({ stateBase64: state, updatedAt: stamp })
        .where(and(eq(collabDocs.key, key), eq(collabDocs.updatedAt, doc.updatedAt)))
    : db.insert(collabDocs).values({ key, stateBase64: state, updatedAt: stamp }).onConflictDoNothing();

  await db.batch([
    write,
    db
      .delete(collabUpdates)
      .where(
        and(
          eq(collabUpdates.key, key),
          inArray(collabUpdates.id, ids),
          exists(
            db
              .select({ one: sql`1` })
              .from(collabDocs)
              .where(and(eq(collabDocs.key, key), eq(collabDocs.updatedAt, stamp))),
          ),
        ),
      ),
  ]);
}

/** Drops every trace of a key (document deleted). */
export function deleteCollabQueries(key: string) {
  return [
    db.delete(collabDocs).where(eq(collabDocs.key, key)),
    db.delete(collabUpdates).where(or(eq(collabUpdates.key, key), eq(collabUpdates.key, awarenessKey(key)))),
  ] as const;
}
