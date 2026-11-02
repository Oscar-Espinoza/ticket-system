import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const resolveTxt = vi.fn<(name: string) => Promise<string[][]>>();
vi.mock('node:dns/promises', async (orig) => ({
  ...(await orig<typeof import('node:dns/promises')>()),
  resolveTxt: (name: string) => resolveTxt(name),
}));

// A chainable stand-in for drizzle's select builder: every query resolves to `rows`.
let rows: unknown[] = [];
vi.mock('@/lib/db', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'from', 'innerJoin', 'leftJoin', 'where', 'limit']) {
    chain[m] = () => chain;
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(rows);
  return { db: chain };
});

const sso = await import('@/lib/sso');

describe('SSO domain proof (review finding #1)', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret');
    resolveTxt.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('is not proven without the TXT record, and proven with it', async () => {
    resolveTxt.mockRejectedValueOnce(Object.assign(new Error('nx'), { code: 'ENOTFOUND' }));
    expect(await sso.isDomainProven('acme.example', 'ws-a')).toBe(false);

    resolveTxt.mockResolvedValueOnce([[sso.domainVerificationValue('ws-b')]]);
    expect(await sso.isDomainProven('acme.example', 'ws-b')).toBe(true);
  });

  it('does not accept another workspace’s record', async () => {
    resolveTxt.mockResolvedValueOnce([[sso.domainVerificationValue('ws-other')]]);
    expect(await sso.isDomainProven('evil.example', 'ws-c')).toBe(false);
  });

  it('refuses SSO identities when the provider domain is unproven', async () => {
    rows = [{ workspaceId: 'ws-d', domain: 'corp.example' }];
    resolveTxt.mockResolvedValue([]);
    const findUser = vi.fn(async () => ({ email: 'victim@corp.example' }));
    await expect(
      sso.assertIdentityDomain({ providerId: 'sso-ws-d', userId: 'u1' }, findUser),
    ).rejects.toMatchObject({ body: { code: 'SSO_DOMAIN_NOT_VERIFIED' } });
  });

  it('does not let an unproven claim enforce SSO on the domain', async () => {
    rows = [{ workspaceId: 'ws-e', domain: 'corp2.example' }];
    resolveTxt.mockResolvedValue([]);
    expect(await sso.enforcedSsoForEmail('someone@corp2.example')).toBeNull();
  });

  it('does not upgrade account linking for an unproven provider', async () => {
    rows = [{ workspaceId: 'ws-f', domain: 'corp3.example' }];
    resolveTxt.mockResolvedValue([]);
    expect(await sso.ssoCallbackContext('/sso/callback/:providerId', 'sso-ws-f', {})).toBeNull();

    rows = [{ workspaceId: 'ws-g', domain: 'corp4.example' }];
    resolveTxt.mockResolvedValue([[sso.domainVerificationValue('ws-g')]]);
    expect(await sso.ssoCallbackContext('/sso/callback/:providerId', 'sso-ws-g', {})).not.toBeNull();
  });
});
