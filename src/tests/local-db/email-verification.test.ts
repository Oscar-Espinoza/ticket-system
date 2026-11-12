// Email verification with email configured and REQUIRE_EMAIL_VERIFICATION
// off (the default): sign-up sends the link, the link verifies (and signs
// nobody in), bad links don't, Google links to an existing password account
// only once its address is verified, resends are limited per user, the
// address can't be changed, and unverified accounts still sign in.
// Real Better Auth against the local database; only outbound HTTP is stubbed.
import { SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';

vi.hoisted(() => {
  process.env.RESEND_API_KEY = 're_test_not_a_real_key';
  process.env.EMAIL_FROM = 'Tickets <tickets@verify.test>';
  process.env.GOOGLE_CLIENT_ID = 'google-test.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'google-test-secret';
  delete process.env.REQUIRE_EMAIL_VERIFICATION;
});

import { db } from '@/lib/db';
import { users, verifications } from '@/db/schema';
import { localDb } from './guard';
import {
  accountsOf,
  authContext,
  cookieOf,
  emailsTo,
  googleSignIn,
  openVerifyLink,
  sendVerification,
  sessionUserId,
  signIn,
  signUp,
  stubOutboundHttp,
  uniqueEmail,
  userByEmail,
  verifyLinkFor,
} from './auth-email-flow';
import { authRequest } from '../mcp/oauth-flow';

describe.skipIf(!localDb)('email verification (email configured, not required)', () => {
  beforeAll(() => stubOutboundHttp());
  afterAll(() => {
    vi.unstubAllGlobals();
    for (const key of ['RESEND_API_KEY', 'EMAIL_FROM', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']) delete process.env[key];
  });

  it('emails a verification link on sign-up that lands on /email-verification, and still signs in', async () => {
    const email = uniqueEmail('signup');
    const res = await signUp(email, '/invite/abc');
    expect(res.status).toBe(200);
    expect(await sessionUserId(res)).toBe((await userByEmail(email)).id);

    const [mail] = emailsTo(email);
    expect(mail).toMatchObject({ from: 'Tickets <tickets@verify.test>', subject: 'Verify your email address' });
    const link = verifyLinkFor(email);
    expect(link.origin + link.pathname).toBe(`${new URL(process.env.BETTER_AUTH_URL ?? 'http://localhost:3000').origin}/api/auth/verify-email`);
    expect(link.searchParams.get('callbackURL')).toBe('/email-verification?verified=1&redirect=%2Finvite%2Fabc');
    expect((await userByEmail(email)).emailVerified).toBe(false);
  });

  it('verifies through the link without creating a session for whoever opens it', async () => {
    const email = uniqueEmail('verify');
    await signUp(email);
    const res = await openVerifyLink(verifyLinkFor(email));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/email-verification?verified=1');
    expect((await userByEmail(email)).emailVerified).toBe(true);
    // autoSignInAfterVerification is off: no password / 2FA / SSO bypass.
    expect(await sessionUserId(res)).toBeNull();
  });

  it('rejects a garbage token and an expired token without verifying anyone', async () => {
    const email = uniqueEmail('badlink');
    await signUp(email);
    const callbackURL = encodeURIComponent('/email-verification?verified=1');

    const garbage = await authRequest(`/verify-email?token=not-a-token&callbackURL=${callbackURL}`, { method: 'GET' });
    expect(garbage.headers.get('location')).toBe('/email-verification?verified=1&error=INVALID_TOKEN');

    const now = Math.floor(Date.now() / 1000);
    const expiredToken = await new SignJWT({ email })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now - 7200)
      .setExpirationTime(now - 3600)
      .sign(new TextEncoder().encode((await authContext()).secret));
    const expired = await authRequest(`/verify-email?token=${expiredToken}&callbackURL=${callbackURL}`, { method: 'GET' });
    expect(expired.headers.get('location')).toBe('/email-verification?verified=1&error=TOKEN_EXPIRED');

    expect((await userByEmail(email)).emailVerified).toBe(false);
  });

  it('links Google to an existing password account only after its email is verified, to the same user', async () => {
    const email = uniqueEmail('link');
    await signUp(email);
    const { id: userId } = await userByEmail(email);
    const profile = { sub: `g-${userId}`, email, email_verified: true, name: 'Linked' };

    const refused = await googleSignIn(profile);
    expect(refused.headers.get('location')).toBe('/login?error=account_not_linked');
    expect(await sessionUserId(refused)).toBeNull();
    expect((await accountsOf(userId)).map((a) => a.providerId)).toEqual(['credential']);

    await openVerifyLink(verifyLinkFor(email));
    const linked = await googleSignIn(profile);
    expect(linked.headers.get('location')).toBe('/dashboard');
    expect(await sessionUserId(linked)).toBe(userId);
    expect((await accountsOf(userId)).map((a) => a.providerId).sort()).toEqual(['credential', 'google']);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.email, email));
    expect(count).toBe(1);
  });

  it('never links when Google itself does not vouch for the address', async () => {
    const email = uniqueEmail('unverified-google');
    await signUp(email);
    await openVerifyLink(verifyLinkFor(email));
    const { id: userId } = await userByEmail(email);

    const res = await googleSignIn({ sub: `g-${userId}`, email, email_verified: false, name: 'Nope' });
    expect(res.headers.get('location')).toBe('/login?error=account_not_linked');
    expect((await accountsOf(userId)).map((a) => a.providerId)).toEqual(['credential']);
  });

  it('sends at most one verification email per user per minute', async () => {
    const email = uniqueEmail('resend');
    const cookie = cookieOf(await signUp(email));
    expect(emailsTo(email)).toHaveLength(1);

    // Signed in (the banner) and signed out (the sign-in form): both inside the cooldown.
    expect((await sendVerification(email, cookie)).status).toBe(200);
    expect((await sendVerification(email)).status).toBe(200);
    expect(emailsTo(email)).toHaveLength(1);

    const { id } = await userByEmail(email);
    await db
      .update(verifications)
      .set({ expiresAt: sql`now() - interval '1 second'` })
      .where(eq(verifications.identifier, `verification-email-sent:${id}`));
    expect((await sendVerification(email, cookie)).status).toBe(200);
    expect(emailsTo(email)).toHaveLength(2);
  });

  it('cannot change the address, so a verified flag never moves to an unproven one', async () => {
    const email = uniqueEmail('change');
    const cookie = cookieOf(await signUp(email));
    await openVerifyLink(verifyLinkFor(email));
    const target = uniqueEmail('target');

    const change = await authRequest('/change-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ newEmail: target }),
      cookie,
    });
    expect(change.status).toBe(400);
    const update = await authRequest('/update-user', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: target }),
      cookie,
    });
    expect(update.status).toBe(400);

    expect(await userByEmail(target)).toBeUndefined();
    expect(emailsTo(target)).toHaveLength(0);
    expect(await userByEmail(email)).toMatchObject({ email, emailVerified: true });
  });

  it('keeps signing in unverified password accounts while the switch is off', async () => {
    const email = uniqueEmail('lenient');
    await signUp(email);
    const res = await signIn(email);
    expect(res.status).toBe(200);
    expect(await sessionUserId(res)).toBe((await userByEmail(email)).id);
  });
});
