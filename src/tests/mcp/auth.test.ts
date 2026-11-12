// /mcp authentication (docs/mcp/PLAN.md D4/D5 + security checklist): the 401
// challenge, protected-resource metadata, the JWT checks (audience, expiry,
// tampering, revoked consent, disabled client), API keys, the insufficient
// scope tool error, and refresh-token rotation. Needs a local Postgres
// (LOCAL_DB_TESTS=1, see src/tests/local-db/guard.ts).
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

vi.mock('@/lib/kit/request', async (orig) => ({
  ...(await orig<typeof import('@/lib/kit/request')>()),
  after: () => undefined,
}));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { apiKeys, oauthClients, oauthConsents } from '@/db/schema';
import { authenticateApiRequest, generateApiKey } from '@/lib/api-auth';
import { handleMcpPost } from '@/lib/server/mcp/http';
import { protectedResourceMetadata } from '@/lib/server/mcp/metadata';
import { mcpUrl } from '@/lib/server/mcp/urls';
import { localDb } from '../local-db/guard';
import { AUTH_ORIGIN, authorize, authRequest, refresh, registerPublicClient, signUp } from './oauth-flow';

function mcpRequest(token: string | null, method = 'tools/list', params?: Record<string, unknown>) {
  return handleMcpPost(
    new Request(mcpUrl(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-06-18',
        ...(token && { authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params && { params }) }),
    }),
  );
}

const challengeOf = (res: Response) => res.headers.get('www-authenticate') ?? '';

describe.skipIf(!localDb)('MCP authentication', () => {
  let user: { cookie: string; userId: string };
  let clientId: string;

  beforeAll(async () => {
    user = await signUp('mcp-auth');
    clientId = await registerPublicClient();
  });

  it('challenges unauthenticated calls with the resource metadata URL', async () => {
    const res = await mcpRequest(null);
    expect(res.status).toBe(401);
    expect(challengeOf(res)).toBe(
      `Bearer resource_metadata="${AUTH_ORIGIN}/.well-known/oauth-protected-resource/mcp", scope="read write"`,
    );
    expect(res.headers.get('access-control-expose-headers')).toContain('WWW-Authenticate');
  });

  it('publishes protected-resource metadata for the exact MCP URL', async () => {
    expect(await protectedResourceMetadata()).toEqual({
      resource: `${AUTH_ORIGIN}/mcp`,
      authorization_servers: [`${AUTH_ORIGIN}/api/auth`],
      scopes_supported: ['read', 'write'],
      bearer_methods_supported: ['header'],
      resource_name: 'Ticket System',
      resource_documentation: `${AUTH_ORIGIN}/dashboard/settings/oauth-apps`,
    });
  });

  it('advertises registration, PKCE S256, public clients and offline_access in AS metadata', async () => {
    const res = await authRequest('/.well-known/openid-configuration');
    const metadata = (await res.json()) as Record<string, unknown>;
    expect(metadata.issuer).toBe(`${AUTH_ORIGIN}/api/auth`);
    expect(metadata.registration_endpoint).toBe(`${AUTH_ORIGIN}/api/auth/oauth2/register`);
    expect(metadata.code_challenge_methods_supported).toEqual(['S256']);
    expect(metadata.token_endpoint_auth_methods_supported).toContain('none');
    expect(metadata.scopes_supported).toContain('offline_access');
  });

  it('accepts a JWT issued for the MCP resource, and /api/v1 still rejects it', async () => {
    const tokens = await authorize(user.cookie, clientId);
    expect(tokens.access_token.split('.')).toHaveLength(3);
    const res = await mcpRequest(tokens.access_token);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { result: { tools: unknown[] } }).result.tools.length).toBe(12);

    const rest = await authenticateApiRequest(
      new Request(`${AUTH_ORIGIN}/api/v1/me`, { headers: { authorization: `Bearer ${tokens.access_token}` } }),
    );
    expect(rest.ok).toBe(false);
  });

  it('rejects JWTs for another audience, expired or tampered', async () => {
    const sign = (payload: Record<string, unknown>) =>
      auth.api.signJWT({ body: { payload } }).then((r) => (r as { token: string }).token);
    const now = Math.floor(Date.now() / 1000);
    const base = { sub: user.userId, azp: clientId, scope: 'read write', iss: `${AUTH_ORIGIN}/api/auth` };

    const good = await sign({ ...base, aud: mcpUrl(), exp: now + 600 });
    expect((await mcpRequest(good)).status).toBe(200);

    const wrongAudience = await sign({ ...base, aud: `${AUTH_ORIGIN}/api/auth`, exp: now + 600 });
    const expired = await sign({ ...base, aud: mcpUrl(), iat: now - 7200, exp: now - 3600 });
    const [h, p, s] = good.split('.');
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    const tampered = [h, Buffer.from(JSON.stringify({ ...claims, sub: 'someone-else' })).toString('base64url'), s].join('.');
    // A session JWT (the jwt plugin's /token endpoint) is not an MCP token either.
    const sessionJwt = ((await (await authRequest('/token', { cookie: user.cookie })).json()) as { token: string }).token;

    for (const token of [wrongAudience, expired, tampered, sessionJwt]) {
      const res = await mcpRequest(token);
      expect(res.status).toBe(401);
      expect(challengeOf(res)).toContain('error="invalid_token"');
    }
  });

  it('stops a JWT as soon as consent is revoked or the client disabled', async () => {
    const otherClient = await registerPublicClient();
    const tokens = await authorize(user.cookie, otherClient);
    expect((await mcpRequest(tokens.access_token)).status).toBe(200);

    await db.update(oauthClients).set({ disabled: true }).where(eq(oauthClients.clientId, otherClient));
    expect((await mcpRequest(tokens.access_token)).status).toBe(401);
    await db.update(oauthClients).set({ disabled: false }).where(eq(oauthClients.clientId, otherClient));
    expect((await mcpRequest(tokens.access_token)).status).toBe(200);

    await db
      .delete(oauthConsents)
      .where(and(eq(oauthConsents.clientId, otherClient), eq(oauthConsents.userId, user.userId)));
    expect((await mcpRequest(tokens.access_token)).status).toBe(401);
  });

  it('accepts an opaque OAuth token (no resource) and a personal API key', async () => {
    const opaque = await authorize(user.cookie, clientId, 'read write', null);
    expect(opaque.access_token).not.toContain('.');
    expect((await mcpRequest(opaque.access_token)).status).toBe(200);

    const { key, prefix, hash } = generateApiKey();
    await db.insert(apiKeys).values({
      id: crypto.randomUUID(),
      userId: user.userId,
      name: 'claude code',
      prefix,
      keyHash: hash,
      createdAt: new Date(),
    });
    expect((await mcpRequest(key)).status).toBe(200);
  });

  it('answers a write tool called with a read-only token with an insufficient_scope tool error', async () => {
    const tokens = await authorize(user.cookie, clientId, 'read');
    const res = await mcpRequest(tokens.access_token, 'tools/call', {
      name: 'create_issue',
      arguments: { project: 'NOPE', title: 'x' },
    });
    expect(res.status).toBe(200);
    const result = ((await res.json()) as { result: { isError: boolean; _meta: Record<string, string[]> } }).result;
    expect(result.isError).toBe(true);
    expect(result._meta['mcp/www_authenticate'][0]).toMatch(/^Bearer resource_metadata=".*", error="insufficient_scope", scope="write"/);
  });

  it('rotates refresh tokens: a new one in the same response, the old one dead', async () => {
    const tokens = await authorize(user.cookie, clientId);
    expect(tokens.refresh_token).toBeTruthy();
    const first = await refresh(clientId, tokens.refresh_token!);
    expect(first.status).toBe(200);
    const rotated = (await first.json()) as { access_token: string; refresh_token: string };
    expect(rotated.refresh_token).toBeTruthy();
    expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
    expect((await mcpRequest(rotated.access_token)).status).toBe(200);

    const replay = await refresh(clientId, tokens.refresh_token!);
    expect(replay.status).toBeGreaterThanOrEqual(400);
  });
});
