// Google sign-in is optional: the provider list, the UI flag and the real
// Better Auth authorization URL. No network and no database: Better Auth runs
// on its in-memory adapter and only builds the redirect URL to Google.

import { betterAuth } from 'better-auth';
import { callbackOAuth } from 'better-auth/api';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it } from 'vitest';

import { googleSignInEnabled, signInProviders, socialProviderOptions } from '@/lib/auth-providers';
import { isNonSsoSignIn } from '@/lib/sso';

const GITHUB = { GITHUB_CLIENT_ID: 'gh-id', GITHUB_CLIENT_SECRET: 'gh-secret' };
const GOOGLE = { GOOGLE_CLIENT_ID: 'g-id.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'g-secret' };

describe('socialProviderOptions / googleSignInEnabled', () => {
  it('registers no Google provider and reports it off when the variables are empty', () => {
    for (const env of [
      { ...GITHUB },
      { ...GITHUB, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' },
      { ...GITHUB, GOOGLE_CLIENT_ID: 'only-id', GOOGLE_CLIENT_SECRET: '' },
      { ...GITHUB, GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: 'only-secret' },
      { ...GITHUB, GOOGLE_CLIENT_ID: '  ', GOOGLE_CLIENT_SECRET: '  ' },
    ]) {
      expect(socialProviderOptions(env)).not.toHaveProperty('google');
      expect(googleSignInEnabled(env)).toBe(false);
    }
  });

  it('registers Google next to the unchanged GitHub entry and reports it on when both are set', () => {
    const env = { ...GITHUB, ...GOOGLE };
    const options = socialProviderOptions(env);
    expect(options.github).toEqual({ clientId: 'gh-id', clientSecret: 'gh-secret', scope: ['read:user', 'user:email'] });
    expect(options.google).toMatchObject({ clientId: GOOGLE.GOOGLE_CLIENT_ID, clientSecret: 'g-secret' });
    expect(googleSignInEnabled(env)).toBe(true);
  });
});

describe('signInProviders (what the login / sign-up pages show)', () => {
  it('turns each button on only when its own provider is configured', () => {
    expect(signInProviders({})).toEqual({ githubEnabled: false, googleEnabled: false });
    expect(signInProviders({ ...GOOGLE })).toEqual({ githubEnabled: false, googleEnabled: true });
    expect(signInProviders({ ...GITHUB })).toEqual({ githubEnabled: true, googleEnabled: false });
  });
});

async function authorizationUrl(env: Record<string, string>, provider: 'google' | 'github') {
  const auth = betterAuth({
    baseURL: 'https://tickets.example.com',
    secret: 'test-secret-test-secret-test-secret-123',
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    socialProviders: socialProviderOptions(env),
  });
  const res = await auth.api.signInSocial({ body: { provider, callbackURL: '/dashboard' } });
  return new URL(res.url!);
}

describe('the Google authorization request (real Better Auth)', () => {
  it('asks only for openid/email/profile, offline access off, and the documented redirect URI', async () => {
    const url = await authorizationUrl({ ...GITHUB, ...GOOGLE }, 'google');
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe(GOOGLE.GOOGLE_CLIENT_ID);
    expect(url.searchParams.get('redirect_uri')).toBe('https://tickets.example.com/api/auth/callback/google');
    expect(new Set(url.searchParams.get('scope')!.split(' '))).toEqual(new Set(['openid', 'email', 'profile']));
    expect(url.searchParams.get('access_type')).toBeNull();
  });

  it('has no google provider to start when the variables are empty', async () => {
    await expect(authorizationUrl({ ...GITHUB }, 'google')).rejects.toThrow();
  });
});

describe('Enforce SSO', () => {
  it('treats the OAuth callback path Google signs in through (same as GitHub) as a non-SSO sign-in', () => {
    // auth.ts session.create.before refuses sessions on these paths for an enforced domain.
    expect(isNonSsoSignIn(callbackOAuth.path)).toBe(true);
    expect(isNonSsoSignIn('/sign-in/social')).toBe(true);
  });
});
