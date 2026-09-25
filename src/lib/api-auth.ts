// Public API authentication: personal API keys (`Authorization: Bearer lc_…`).
//
// Keys are shown once at creation and only their sha256 is stored, so a leaked
// database doesn't leak working keys. A key acts as its user: every /api/v1
// handler still checks project membership + role for each call.

import { createHash, randomBytes } from 'node:crypto';
import { after } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { apiKeys } from '@/db/schema';

export const API_KEY_PREFIX = 'lc_';
const PREFIX_LENGTH = 10;
/** Don't write lastUsedAt on every request — once a minute is plenty. */
const LAST_USED_THROTTLE_MS = 60_000;

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
  return { key, prefix: key.slice(0, PREFIX_LENGTH), hash: hashApiKey(key) };
}

/** Consistent `{ error }` JSON error body. */
export function apiError(status: number, error: string, extra?: Record<string, unknown>): Response {
  return Response.json({ error, ...extra }, { status });
}

export type ApiAuth = { ok: true; userId: string; keyId: string } | { ok: false; response: Response };

const UNAUTHORIZED = () =>
  Response.json(
    { error: 'Missing or invalid API key.' },
    { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
  );

export async function authenticateApiRequest(req: Request): Promise<ApiAuth> {
  const header = req.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(\S+)$/i);
  const key = match?.[1];
  if (!key || !key.startsWith(API_KEY_PREFIX) || key.length > 200) {
    return { ok: false, response: UNAUTHORIZED() };
  }

  const [row] = await db
    .select({ id: apiKeys.id, userId: apiKeys.userId, lastUsedAt: apiKeys.lastUsedAt })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hashApiKey(key)), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (!row) return { ok: false, response: UNAUTHORIZED() };

  const now = Date.now();
  if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
    const touch = () =>
      db
        .update(apiKeys)
        .set({ lastUsedAt: new Date(now) })
        .where(eq(apiKeys.id, row.id))
        .then(
          () => undefined,
          (err) => console.error('[api] failed to record key use', err),
        );
    try {
      after(touch);
    } catch {
      void touch();
    }
  }
  return { ok: true, userId: row.userId, keyId: row.id };
}

/** Parse a JSON object body, or a 400 response. */
export async function readJsonBody(
  req: Request,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  try {
    const body: unknown = await req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      return { ok: true, body: body as Record<string, unknown> };
    }
  } catch {
    // fall through
  }
  return { ok: false, response: apiError(400, 'Request body must be a JSON object.') };
}
