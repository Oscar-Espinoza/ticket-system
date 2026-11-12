// Bearer authentication for `/mcp` (docs/mcp/PLAN.md D4). Three token kinds:
//   1. JWT access tokens Better Auth issues for `resource=<origin>/mcp`: signature
//      (our JWKS), issuer, audience = the MCP URL exactly, expiry; then the
//      client must still exist and be enabled and the user's consent row for
//      it must still exist, so revoking in Settings → OAuth apps takes effect
//      at once instead of after the token's hour.
//   2. Opaque OAuth access tokens (clients that omit `resource`), and
//   3. personal API keys (`lc_…`), both through src/lib/api-auth.ts, the owner
//      of those checks (revoking consent deletes the opaque tokens).
// Never a session cookie: `/mcp` answers cross-origin requests with CORS `*`.
//
// /api/v1 keeps rejecting JWTs (api-auth.ts), so a token minted for /mcp can't
// be replayed against the REST API and vice versa for audiences.

import { and, eq } from 'drizzle-orm';
import { verifyJwsAccessToken } from 'better-auth/oauth2';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { API_KEY_PREFIX, authenticateApiRequest, type ApiScope } from '@/lib/api-auth';
import { oauthClients, oauthConsents, users } from '@/db/schema';
import type { McpCredential } from './contracts';
import { MCP_SCOPES, mcpUrl, protectedResourceMetadataUrl } from './urls';

export type McpAuth = { ok: true; credential: McpCredential } | { ok: false; response: Response };

/** The RFC 6750 / RFC 9728 challenge `/mcp` answers unauthenticated calls with. */
export function wwwAuthenticate(error?: { code: string; description: string }): string {
  const parts = [
    `resource_metadata="${protectedResourceMetadataUrl()}"`,
    `scope="${MCP_SCOPES.join(' ')}"`,
  ];
  if (error) parts.push(`error="${error.code}"`, `error_description="${error.description}"`);
  return `Bearer ${parts.join(', ')}`;
}

export function unauthorized(error?: { code: string; description: string }): Response {
  return Response.json(
    { error: error?.code ?? 'unauthorized', error_description: error?.description ?? 'Sign in to use this server.' },
    { status: 401, headers: { 'WWW-Authenticate': wwwAuthenticate(error) } },
  );
}

const INVALID_TOKEN = { code: 'invalid_token', description: 'The access token is invalid, expired or revoked.' };

const toScopes = (values: Iterable<string>) =>
  new Set([...values].filter((s): s is ApiScope => s === 'read' || s === 'write'));

/** Cache key for the JWKS (verifyJwsAccessToken caches per key object for five minutes). */
const JWKS_CACHE_KEY = {};

async function authenticateJwt(token: string): Promise<McpAuth> {
  const context = await auth.$context;
  let payload: Awaited<ReturnType<typeof verifyJwsAccessToken>>;
  try {
    payload = await verifyJwsAccessToken(token, {
      jwksFetch: () => auth.api.getJwks(),
      jwksCacheKey: JWKS_CACHE_KEY,
      verifyOptions: { issuer: context.baseURL, audience: mcpUrl() },
    });
  } catch {
    return { ok: false, response: unauthorized(INVALID_TOKEN) };
  }
  const userId = typeof payload.sub === 'string' ? payload.sub : null;
  const clientId = typeof payload.azp === 'string' ? payload.azp : null;
  if (!userId || !clientId || typeof payload.exp !== 'number') {
    return { ok: false, response: unauthorized(INVALID_TOKEN) };
  }

  // Client still enabled, consent still granted, user still exists.
  const [row] = await db
    .select({
      name: oauthClients.name,
      disabled: oauthClients.disabled,
      consentScopes: oauthConsents.scopes,
    })
    .from(oauthClients)
    .innerJoin(
      oauthConsents,
      and(eq(oauthConsents.clientId, oauthClients.clientId), eq(oauthConsents.userId, userId)),
    )
    .innerJoin(users, eq(users.id, userId))
    .where(eq(oauthClients.clientId, clientId))
    .limit(1);
  if (!row || row.disabled) return { ok: false, response: unauthorized(INVALID_TOKEN) };

  // Never more than the user still consents to.
  const granted = new Set(row.consentScopes);
  const tokenScopes = typeof payload.scope === 'string' ? payload.scope.split(' ') : [];
  return {
    ok: true,
    credential: {
      userId,
      via: 'jwt',
      clientId,
      clientName: row.name,
      scopes: toScopes(tokenScopes.filter((s) => granted.has(s))),
    },
  };
}

export async function authenticateMcpRequest(req: Request): Promise<McpAuth> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.match(/^Bearer\s+(\S+)$/i)?.[1];
  // No credentials: the bare challenge (RFC 6750 §3.1: no error code).
  if (!token) return { ok: false, response: unauthorized() };
  if (token.length > 4096) return { ok: false, response: unauthorized(INVALID_TOKEN) };

  if (!token.startsWith(API_KEY_PREFIX) && token.includes('.')) return authenticateJwt(token);

  const result = await authenticateApiRequest(req);
  if (!result.ok) return { ok: false, response: unauthorized(INVALID_TOKEN) };
  let clientName: string | null = null;
  if (result.clientId) {
    const [client] = await db
      .select({ name: oauthClients.name })
      .from(oauthClients)
      .where(eq(oauthClients.clientId, result.clientId))
      .limit(1);
    clientName = client?.name ?? null;
  }
  return {
    ok: true,
    credential: {
      userId: result.userId,
      via: result.via,
      clientId: result.clientId,
      clientName,
      scopes: result.scopes,
    },
  };
}
