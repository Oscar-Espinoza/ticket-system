// Yjs relay over Postgres (no websockets on Vercel Hobby). See
// .planning/features/D2-collaborative-editing.md.
//   GET  ?sv=<b64 state vector>          full sync (diff) + recent awareness
//   GET  ?after=<id>&client=<id>          long-poll: returns as soon as other
//                                         clients wrote something (≤ ~20 s)
//   POST { client, update?, awareness?, seed? }
// Keys: doc:<documentId> | issue:<ticketId>. Read access for GET, write for
// POST (guests follow along read-only). Unknown and foreign keys → 404.

import type { RequestHandler } from './$types';
import { allowOptions } from '../../_lib/options';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, modifyAwarenessUpdate } from 'y-protocols/awareness';

import {
  BASE64,
  MAX_UPDATE_CHARS,
  fromBase64,
  toBase64,
  type CollabPollResponse,
  type CollabPostBody,
  type CollabPostResponse,
  type CollabSyncResponse,
} from '@/lib/collab/codec';
import { resolveCollabAccess, type CollabAccess } from '@/lib/collab/keys';
import {
  appendAwareness,
  appendUpdate,
  maybeCompact,
  readFullState,
  readRowsAfter,
  seedState,
} from '@/lib/collab/store';
import { after as afterResponse } from '@/lib/kit/next-shims';
import { db } from '@/lib/db';
import { tickets } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { CollabProjection } from '@/lib/collab/codec';

/** The issue's stored description (access was checked by authorize). */
async function readIssueProjection(ticketId: string): Promise<CollabProjection | undefined> {
  const [row] = await db
    .select({ description: tickets.description, source: tickets.descriptionSource, rev: tickets.descriptionRev })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1);
  return row ? { markdown: row.description ?? '', source: row.source ?? null, rev: row.rev } : undefined;
}

// Read by adapter-vercel (ignored by adapter-node); was `maxDuration` under Next.
export const config = { maxDuration: 30 };

const POLL_MS = 600;
const LONG_POLL_MS = 20_000;
const CLIENT = /^[A-Za-z0-9_-]{8,64}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const NO_STORE = { 'Cache-Control': 'no-store' };

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

type AuthorizeEvent = { params: { key: string }; locals: App.Locals };

type Authorized =
  | { error: Response }
  | { error?: undefined; key: string; access: CollabAccess; user: NonNullable<App.Locals['user']> };

async function authorize({ params, locals }: AuthorizeEvent): Promise<Authorized> {
  const { key: raw } = params;
  const user = locals.user;
  if (!user) return { error: json({ error: 'Not authenticated' }, 401) };
  let key: string;
  try {
    key = decodeURIComponent(raw);
  } catch {
    return { error: json({ error: 'Not found' }, 404) };
  }
  const access = await resolveCollabAccess(key, user.id);
  if (!access) return { error: json({ error: 'Not found' }, 404) };
  return { key, access, user };
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done);
  });
}

export const GET: RequestHandler = async (event) => {
  const { request } = event;
  const auth = await authorize(event);
  if (auth.error) return auth.error;
  const { key } = auth;
  const params = event.url.searchParams;

  const afterParam = params.get('after');
  if (afterParam === null) {
    const sv = params.get('sv');
    let vector: Uint8Array | null = null;
    if (sv) {
      if (sv.length > 100_000 || !BASE64.test(sv)) return json({ error: 'Bad state vector' }, 400);
      vector = fromBase64(sv);
    }
    try {
      const [state, projection] = await Promise.all([
        readFullState(key, vector),
        auth.access.kind === 'issue' ? readIssueProjection(auth.access.id) : undefined,
      ]);
      return json({
        ...state,
        canWrite: auth.access.canWrite,
        ...(projection ? { projection } : {}),
      } satisfies CollabSyncResponse);
    } catch (err) {
      // A malformed state vector makes diffUpdate throw.
      console.error('[collab] sync failed', err);
      return json({ error: 'Sync failed' }, 400);
    }
  }

  const after = Number(afterParam);
  if (!Number.isSafeInteger(after) || after < 0) return json({ error: 'Bad cursor' }, 400);
  const client = params.get('client');
  const except = client && CLIENT.test(client) ? client : null;

  const started = Date.now();
  let result = await readRowsAfter(key, after, except);
  // Only the caller's own rows moved the cursor: nothing to apply, keep waiting.
  while (
    result.updates.length === 0 &&
    result.awareness.length === 0 &&
    Date.now() - started < LONG_POLL_MS &&
    !request.signal.aborted
  ) {
    await sleep(POLL_MS, request.signal);
    if (request.signal.aborted) break;
    result = await readRowsAfter(key, result.lastId, except);
  }
  return json(result satisfies CollabPollResponse);
};

function validUpdate(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_UPDATE_CHARS && BASE64.test(value);
}

export const POST: RequestHandler = async (event) => {
  const { request } = event;
  const auth = await authorize(event);
  if (auth.error) return auth.error;
  const { key, access, user } = auth;

  const body = (await request.json().catch(() => null)) as Partial<CollabPostBody> | null;
  if (!body || typeof body.client !== 'string' || !CLIENT.test(body.client)) return json({ error: 'Bad request' }, 400);
  const { client } = body;

  // Awareness (cursor + name) is allowed for readers too, so guests show up.
  let awarenessId: number | null = null;
  if (body.awareness !== undefined) {
    if (!validUpdate(body.awareness) || body.awareness.length > 20_000) return json({ error: 'Bad awareness' }, 400);
    let stamped: string;
    try {
      // The server stamps who this is, so names/avatars can't be spoofed.
      const bytes = modifyAwarenessUpdate(fromBase64(body.awareness), (state: unknown) => {
        if (!state || typeof state !== 'object') return state;
        const s = state as { user?: { color?: unknown } };
        const color = typeof s.user?.color === 'string' && COLOR.test(s.user.color) ? s.user.color : '#6b7280';
        return { ...s, user: { id: user.id, name: user.name, image: user.image ?? null, color } };
      });
      // Parse check on a throwaway instance: malformed input must never reach other clients.
      const scratch = new Awareness(new Y.Doc());
      try {
        applyAwarenessUpdate(scratch, bytes, null);
      } finally {
        scratch.destroy();
      }
      stamped = toBase64(bytes);
    } catch {
      return json({ error: 'Bad awareness' }, 400);
    }
    awarenessId = await appendAwareness(key, stamped, client);
  }

  if (body.update === undefined) return json({ id: awarenessId } satisfies CollabPostResponse);
  if (!access.canWrite) return json({ error: 'Forbidden' }, 403);
  if (!validUpdate(body.update)) {
    return json({ error: 'Bad update' }, body.update && String(body.update).length > MAX_UPDATE_CHARS ? 413 : 400);
  }
  try {
    Y.decodeUpdate(fromBase64(body.update));
  } catch {
    return json({ error: 'Bad update' }, 400);
  }

  if (body.seed === true) {
    const seeded = await seedState(key, body.update);
    return json({ id: null, seeded } satisfies CollabPostResponse);
  }

  const id = await appendUpdate(key, body.update, client);
  // Cheap sampling instead of counting on every keystroke batch.
  if (Math.random() < 0.1) {
    afterResponse(() => maybeCompact(key).catch((err) => console.error('[collab] compaction failed', err)));
  }
  return json({ id } satisfies CollabPostResponse);
};

// Next answered OPTIONS automatically (204 + Allow); Kit would 405.
export const OPTIONS = allowOptions('GET', 'POST');
