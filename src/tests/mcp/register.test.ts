// Dynamic client registration through Better Auth's /oauth2/register with the
// MCP policy (docs/mcp/PLAN.md D3): allowlisted redirects only, public clients
// only, dynamic clients marked, and stale ones cleaned up daily. Needs a local
// Postgres (LOCAL_DB_TESTS=1).
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { oauthClients } from '@/db/schema';
import { run as cleanup } from '@/lib/cron/jobs/oauth-dcr-cleanup';
import { isDynamicClient } from '@/lib/server/mcp/register';
import { localDb } from '../local-db/guard';
import { register } from './oauth-flow';

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

  it('cleans up dynamic clients with no live token for 30 days, and nothing else', async () => {
    const res = await register(publicClient('http://localhost:4001/cb'));
    const { client_id: stale } = (await res.json()) as { client_id: string };
    const fresh = ((await (await register(publicClient('http://localhost:4002/cb'))).json()) as { client_id: string }).client_id;
    const old = new Date(Date.now() - 31 * 86_400_000);
    await db.update(oauthClients).set({ createdAt: old }).where(eq(oauthClients.clientId, stale));
    // An app someone registered in Settings is never a DCR client, however old.
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
    expect(await stored(fresh)).toBeDefined();
    expect(await stored(manual)).toBeDefined();
  });
});
