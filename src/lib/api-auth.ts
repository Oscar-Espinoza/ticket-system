// Public API authentication: personal API keys (`Authorization: Bearer lc_…`)
// and OAuth 2.0 access tokens issued by Better Auth's oauth-provider plugin.
//
// Keys are shown once at creation and only their sha256 is stored, so a leaked
// database doesn't leak working keys. The plugin stores OAuth tokens the same
// way (base64url sha256). Either kind acts as its user: every /api/v1 and
// GraphQL handler still checks project membership + role for each call, and
// OAuth tokens are further limited to their granted scopes.

import { createHash, randomBytes } from 'node:crypto';
import { after } from 'next/server';
import { and, eq, gt, isNotNull, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { apiKeys, oauthAccessTokens, oauthClients } from '@/db/schema';

export const API_KEY_PREFIX = 'lc_';
const PREFIX_LENGTH = 10;
/** Don't write lastUsedAt on every request — once a minute is plenty. */
const LAST_USED_THROTTLE_MS = 60_000;

/** API scopes: `read` for queries / GET, `write` for mutations / writes. */
export type ApiScope = 'read' | 'write';

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

export interface ApiCredential {
  userId: string;
  /** api_key id, or oauth_access_token id. */
  keyId: string;
  via: 'api_key' | 'oauth';
  /** OAuth client id when `via === 'oauth'`. */
  clientId: string | null;
  /** Granted API scopes (API keys have both). */
  scopes: ReadonlySet<ApiScope>;
}

export type ApiAuth = ({ ok: true } & ApiCredential) | { ok: false; response: Response };

const UNAUTHORIZED = () =>
  Response.json(
    { error: 'Missing or invalid API key or access token.' },
    { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
  );

const ALL_SCOPES: ReadonlySet<ApiScope> = new Set(['read', 'write']);

/** 403 when an OAuth token lacks `scope`; null when allowed. */
export function missingScope(credential: ApiCredential, scope: ApiScope): Response | null {
  if (credential.scopes.has(scope)) return null;
  return Response.json(
    { error: `This access token lacks the "${scope}" scope.` },
    {
      status: 403,
      headers: { 'WWW-Authenticate': `Bearer error="insufficient_scope", scope="${scope}"` },
    },
  );
}

function runAfter(task: () => Promise<unknown>) {
  try {
    after(task);
  } catch {
    void task();
  }
}

async function authenticateApiKey(key: string): Promise<ApiAuth> {
  const [row] = await db
    .select({ id: apiKeys.id, userId: apiKeys.userId, lastUsedAt: apiKeys.lastUsedAt })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hashApiKey(key)), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (!row) return { ok: false, response: UNAUTHORIZED() };

  const now = Date.now();
  if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
    runAfter(() =>
      db
        .update(apiKeys)
        .set({ lastUsedAt: new Date(now) })
        .where(eq(apiKeys.id, row.id))
        .then(
          () => undefined,
          (err) => console.error('[api] failed to record key use', err),
        ),
    );
  }
  return {
    ok: true,
    userId: row.userId,
    keyId: row.id,
    via: 'api_key',
    clientId: null,
    scopes: ALL_SCOPES,
  };
}

/**
 * Opaque OAuth access token → its user. Mirrors the plugin's own validation
 * (hash lookup, expiry, disabled client). Client-credentials tokens have no
 * user and can't act on the API.
 */
async function authenticateOAuthToken(token: string): Promise<ApiAuth> {
  const [row] = await db
    .select({
      id: oauthAccessTokens.id,
      userId: oauthAccessTokens.userId,
      clientId: oauthAccessTokens.clientId,
      scopes: oauthAccessTokens.scopes,
      disabled: oauthClients.disabled,
    })
    .from(oauthAccessTokens)
    .innerJoin(oauthClients, eq(oauthClients.clientId, oauthAccessTokens.clientId))
    .where(
      and(
        eq(oauthAccessTokens.token, createHash('sha256').update(token).digest('base64url')),
        isNotNull(oauthAccessTokens.userId),
        gt(oauthAccessTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row?.userId || row.disabled) return { ok: false, response: UNAUTHORIZED() };
  return {
    ok: true,
    userId: row.userId,
    keyId: row.id,
    via: 'oauth',
    clientId: row.clientId,
    scopes: new Set(row.scopes.filter((s): s is ApiScope => s === 'read' || s === 'write')),
  };
}

export async function authenticateApiRequest(req: Request): Promise<ApiAuth> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token || token.length > 200) return { ok: false, response: UNAUTHORIZED() };
  if (token.startsWith(API_KEY_PREFIX)) return authenticateApiKey(token);
  // JWT access tokens are only issued for a `resource` audience, which we don't
  // advertise; everything else is an opaque token.
  if (token.includes('.')) return { ok: false, response: UNAUTHORIZED() };
  return authenticateOAuthToken(token);
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
