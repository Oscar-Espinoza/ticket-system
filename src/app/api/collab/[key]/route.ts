// Yjs relay over Postgres (no websockets on Vercel Hobby). See
// .planning/features/D2-collaborative-editing.md.
//   GET  ?sv=<b64 state vector>          full sync (diff) + recent awareness
//   GET  ?after=<id>&client=<id>          long-poll: returns as soon as other
//                                         clients wrote something (≤ ~20 s)
//   POST { client, update?, awareness?, seed? }
// Keys: doc:<documentId> | issue:<ticketId>. Read access for GET, write for
// POST (guests follow along read-only). Unknown and foreign keys → 404.

import { after as afterResponse } from 'next/server';
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
import { resolveCollabAccess } from '@/lib/collab/keys';
import {
  appendAwareness,
  appendUpdate,
  maybeCompact,
  readFullState,
  readRowsAfter,
  seedState,
} from '@/lib/collab/store';
import { getSession } from '@/lib/session';

export const maxDuration = 30;

const POLL_MS = 600;
const LONG_POLL_MS = 20_000;
const CLIENT = /^[A-Za-z0-9_-]{8,64}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const NO_STORE = { 'Cache-Control': 'no-store' };

type Ctx = { params: Promise<{ key: string }> };

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

async function authorize(ctx: Ctx) {
  const [{ key: raw }, session] = await Promise.all([ctx.params, getSession()]);
  if (!session?.user) return { error: json({ error: 'Not authenticated' }, 401) } as const;
  let key: string;
  try {
    key = decodeURIComponent(raw);
  } catch {
    return { error: json({ error: 'Not found' }, 404) } as const;
  }
  const access = await resolveCollabAccess(key, session.user.id);
  if (!access) return { error: json({ error: 'Not found' }, 404) } as const;
  return { key, access, user: session.user } as const;
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

export async function GET(request: Request, ctx: Ctx) {
  const auth = await authorize(ctx);
  if ('error' in auth) return auth.error;
  const { key } = auth;
  const params = new URL(request.url).searchParams;

  const afterParam = params.get('after');
  if (afterParam === null) {
    const sv = params.get('sv');
    let vector: Uint8Array | null = null;
    if (sv) {
      if (sv.length > 100_000 || !BASE64.test(sv)) return json({ error: 'Bad state vector' }, 400);
      vector = fromBase64(sv);
    }
    try {
      const state = await readFullState(key, vector);
      return json({ ...state, canWrite: auth.access.canWrite } satisfies CollabSyncResponse);
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
}

function validUpdate(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_UPDATE_CHARS && BASE64.test(value);
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await authorize(ctx);
  if ('error' in auth) return auth.error;
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
}
