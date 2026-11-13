// Dynamic client registration through Better Auth's /oauth2/register with the
// MCP policy (docs/mcp/PLAN.md D3): allowlisted redirects only, public clients
// only, client URLs https only (stored XSS), dynamic clients marked, and
// unused or stale ones cleaned up daily. Needs a local Postgres
// (LOCAL_DB_TESTS=1).
import { describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { oauthAccessTokens, oauthClients, oauthConsents } from '@/db/schema';
import { BATCH as CLEANUP_BATCH, run as cleanup } from '@/lib/cron/jobs/oauth-dcr-cleanup';
import { DYNAMIC_REGISTRATION, isDynamicClient, rendersViews } from '@/lib/server/mcp/register';
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
    'http://localhost:1234',
    'http://127.0.0.1:1234',
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
    // The no-path exception is for loopback only, and only for the bare form.
    'http://localhost.:1234',
    'https://claude.ai',
    'http://localhost:1234?next=https://evil.example',
    // Forms probed in review round 1 (already refused; pinned here).
    'http://localhost.example.com:1234/cb',
    'http://127.0.0.1.example.com:1234/cb',
    'http://localhost:1234@example.com/cb',
    'http://localhost\\@example.com/cb',
    'http://[::1]:1234/cb',
    'http://LOCALHOST:1234/cb',
    'http://localhost:80/cb',
    'http://localhost:01234/cb',
    'http://127.1:1234/cb',
    'http://0x7f000001:1234/cb',
    'http://2130706433:1234/cb',
    ' http://localhost:1234/cb',
    'http://localhost:1234/cb ',
    'http://localhost:1234?',
    'http://localhost:1234#',
    'http://localhost:1234/cb#',
    'https://localhost:1234',
    'https://claude.ai/api/mcp/auth_callback/',
  ])('refuses the redirect %s', async (redirect) => {
    const res = await register(publicClient(redirect));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('invalid_redirect_uri');
  });

  it('tells card hosts by their redirect URIs; MCP_VIEW_REDIRECT_URIS adds one, which may then register', async () => {
    expect(rendersViews(['https://claude.ai/api/mcp/auth_callback'])).toBe(true);
    expect(rendersViews(['https://chatgpt.com/connector_platform_oauth_redirect', 'https://chatgpt.com/connector/oauth/abc'])).toBe(true);
    // Claude Code, MCP Inspector, and a client that could also take its code on loopback.
    expect(rendersViews(['http://localhost:53122/callback'])).toBe(false);
    expect(rendersViews(['https://claude.ai/api/mcp/auth_callback', 'http://localhost:53122/callback'])).toBe(false);
    expect(rendersViews([])).toBe(false);

    const host = 'https://cards.example/oauth/callback';
    expect(rendersViews([host])).toBe(false);
    expect((await register(publicClient(host))).status).toBe(400);
    vi.stubEnv('MCP_VIEW_REDIRECT_URIS', `https://other.example/cb, ${host}`);
    try {
      expect(rendersViews([host])).toBe(true);
      expect((await register(publicClient(host))).status).toBe(200);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('registers a confidential request as a public client (claude.ai sends client_secret_post)', async () => {
    // claude.ai's registration body, as captured from a live connect.
    const claudeAi = {
      redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
      token_endpoint_auth_method: 'client_secret_post',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'read write offline_access',
      client_name: 'Claude',
      application_type: 'web',
    };
    for (const body of [claudeAi, publicClient('http://localhost:4000/cb', { token_endpoint_auth_method: 'client_secret_basic' })]) {
      const res = await register(body);
      expect(res.status, JSON.stringify(body)).toBe(200);
      const out = (await res.json()) as { client_id: string; client_secret?: string; token_endpoint_auth_method: string };
      expect(out.client_secret).toBeUndefined();
      expect(out.token_endpoint_auth_method).toBe('none');
      expect((await stored(out.client_id)).public).toBe(true);
    }
  });

  it('refuses other client auth methods and non-code grants', async () => {
    for (const extra of [
      { token_endpoint_auth_method: 'private_key_jwt' },
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

  it('keeps deleting past one batch in a run', async () => {
    const old = new Date(Date.now() - 2 * 86_400_000);
    const ids = Array.from({ length: CLEANUP_BATCH + 1 }, () => `junk-${crypto.randomUUID()}`);
    await db.insert(oauthClients).values(
      ids.map((clientId) => ({
        id: crypto.randomUUID(),
        clientId,
        name: 'Junk',
        redirectUris: ['http://localhost:4100/cb'],
        public: true,
        metadata: { registration: DYNAMIC_REGISTRATION },
        createdAt: old,
        updatedAt: old,
      })),
    );
    await cleanup(new Date());
    const left = await db.select({ id: oauthClients.id }).from(oauthClients).where(inArray(oauthClients.clientId, ids));
    expect(left).toEqual([]);
  });
});
