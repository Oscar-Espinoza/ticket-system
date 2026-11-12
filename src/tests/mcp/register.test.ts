// Dynamic client registration through Better Auth's /oauth2/register with the
// MCP policy (docs/mcp/PLAN.md D3): allowlisted redirects only, public clients
// only, client URLs https only (stored XSS), dynamic clients marked, and
// unused or stale ones cleaned up daily. Needs a local Postgres
// (LOCAL_DB_TESTS=1).
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { oauthAccessTokens, oauthClients, oauthConsents } from '@/db/schema';
import { run as cleanup } from '@/lib/cron/jobs/oauth-dcr-cleanup';
import { isDynamicClient } from '@/lib/server/mcp/register';
import { localDb } from '../local-db/guard';
import { authRequest, register, signUp } from './oauth-flow';

const publicClient = (redirect: string, extra: Record<string, unknown> = {}) => ({
  client_name: 'Claude',
  redirect_uris: [redirect],
  token_endpoint_auth_method: 'none',
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  ...extra,
});

async function stored(clientId: string) {
  const [row] = await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId));
  return row;
}

describe.skipIf(!localDb)('MCP dynamic client registration', () => {
  it.each([
    'https://claude.ai/api/mcp/auth_callback',
    'https://chatgpt.com/connector_platform_oauth_redirect',
    'https://chatgpt.com/connector/oauth/abc123_DEF-9',
    'http://localhost:53122/callback',
    'http://127.0.0.1:6274/oauth/callback',
  ])('registers a public, dynamic client for %s', async (redirect) => {
    const res = await register(publicClient(redirect));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { client_id: string; client_secret?: string; token_endpoint_auth_method: string };
    expect(body.client_secret).toBeUndefined();
    expect(body.token_endpoint_auth_method).toBe('none');
    const row = await stored(body.client_id);
    expect(row.public).toBe(true);
    expect(isDynamicClient(row.metadata)).toBe(true);
  });

  it.each([
    'https://evil.example/callback',
    'https://claude.ai.evil.example/api/mcp/auth_callback',
    'https://chatgpt.com/connector/oauth/../../steal',
    'http://localhost.evil.example/callback',
    'https://localhost:3000/callback',
    'http://user@localhost:3000/callback',
    // Not in canonical form: the string matched isn't the URL a browser follows.
    'http://localhost\\@evil.com/cb',
    'HTTP://localhost:3000/callback',
    'http://localhost:3000/a/../callback',
  ])('refuses the redirect %s', async (redirect) => {
    const res = await register(publicClient(redirect));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('invalid_redirect_uri');
  });

  it('refuses confidential clients and non-code grants', async () => {
    for (const extra of [
      { token_endpoint_auth_method: 'client_secret_basic' },
      { token_endpoint_auth_method: 'client_secret_post' },
      { type: 'web' },
      { grant_types: ['client_credentials'] },
    ]) {
      const res = await register(publicClient('http://localhost:4000/cb', extra));
      expect(res.status, JSON.stringify(extra)).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe('invalid_client_metadata');
    }
  });

  it('accepts https homepage, logo, terms and policy URLs', async () => {
    const res = await register(
      publicClient('https://claude.ai/api/mcp/auth_callback', {
        client_uri: 'https://claude.ai',
        logo_uri: 'https://claude.ai/logo.png',
        tos_uri: 'https://www.anthropic.com/legal/consumer-terms',
        policy_uri: 'https://www.anthropic.com/legal/privacy',
      }),
    );
    expect(res.status).toBe(200);
    const row = await stored(((await res.json()) as { client_id: string }).client_id);
    expect(row.uri).toBe('https://claude.ai');
  });

  it.each(['client_uri', 'logo_uri', 'tos_uri', 'policy_uri'])('refuses a script or data URL in %s', async (field) => {
    for (const value of ['javascript:alert(document.domain)', 'data:text/html,<script>alert(1)</script>', 'http://example.com/']) {
      const res = await register(publicClient('http://localhost:4000/cb', { [field]: value }));
      expect(res.status, `${field}=${value}`).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe('invalid_client_metadata');
    }
  });

  it('refuses post-logout redirects on dynamic registration', async () => {
    const res = await register(publicClient('http://localhost:4000/cb', { post_logout_redirect_uris: ['https://example.com/'] }));
    expect(res.status).toBe(400);
  });

  it("closes Better Auth's own client endpoints over HTTP and checks URLs when the app calls them", async () => {
    const { cookie } = await signUp('client-writes');
    const body = { client_name: 'X', redirect_uris: ['https://example.com/cb'], client_uri: 'https://example.com' };
    for (const path of ['/oauth2/create-client', '/oauth2/update-client']) {
      const res = await authRequest(path, { method: 'POST', cookie, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      expect(res.status, path).toBe(404);
    }

    const headers = new Headers({ cookie });
    await expect(
      auth.api.createOAuthClient({ headers, body: { ...body, client_uri: 'javascript:alert(1)' } }),
    ).rejects.toMatchObject({ body: { error: 'invalid_client_metadata' } });
    const created = await auth.api.createOAuthClient({ headers, body });
    await expect(
      auth.api.updateOAuthClient({ headers, body: { client_id: created.client_id, update: { policy_uri: 'javascript:alert(1)' } } }),
    ).rejects.toMatchObject({ body: { error: 'invalid_client_metadata' } });
    expect((await stored(created.client_id)).policy).toBeNull();
  });

  it('cleans up unused dynamic clients after a day and stale ones after 30, and nothing else', async () => {
    const dynamic = async (port: number, ageDays: number) => {
      const res = await register(publicClient(`http://localhost:${port}/cb`));
      const { client_id: id } = (await res.json()) as { client_id: string };
      const at = new Date(Date.now() - ageDays * 86_400_000);
      await db.update(oauthClients).set({ createdAt: at }).where(eq(oauthClients.clientId, id));
      return id;
    };
    const stale = await dynamic(4001, 31);
    const fresh = await dynamic(4002, 0);
    const unused = await dynamic(4003, 2);
    const consented = await dynamic(4004, 2);
    const withToken = await dynamic(4005, 2);
    const { userId } = await signUp('dcr-cleanup');
    const now = new Date();
    await db.insert(oauthConsents).values({ id: crypto.randomUUID(), clientId: consented, userId, scopes: ['read'], createdAt: now, updatedAt: now });
    await db.insert(oauthAccessTokens).values({
      id: crypto.randomUUID(),
      token: crypto.randomUUID(),
      clientId: withToken,
      userId,
      scopes: ['read'],
      createdAt: now,
      expiresAt: new Date(now.getTime() + 3600_000),
    });
    // An app someone registered in Settings is never a DCR client, however old or unused.
    const old = new Date(Date.now() - 31 * 86_400_000);
    const manual = `manual-${crypto.randomUUID()}`;
    await db.insert(oauthClients).values({
      id: crypto.randomUUID(),
      clientId: manual,
      name: 'Hand-made',
      redirectUris: ['https://example.com/cb'],
      createdAt: old,
      updatedAt: old,
    });

    await cleanup(new Date());
    expect(await stored(stale)).toBeUndefined();
    expect(await stored(unused)).toBeUndefined();
    expect(await stored(fresh)).toBeDefined();
    expect(await stored(consented)).toBeDefined();
    expect(await stored(withToken)).toBeDefined();
    expect(await stored(manual)).toBeDefined();
  });
});
