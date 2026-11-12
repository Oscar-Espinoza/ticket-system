// Email verification with email configured and REQUIRE_EMAIL_VERIFICATION
// off (the default): sign-up sends the link; the link verifies only inside a
// session of its own account (password + mailbox), never for whoever opens
// it; Google links to an existing password account only once it is verified;
// resends are for the signed-in holder only and limited per user; the address
// can't be changed; unverified accounts still sign in.
// Real Better Auth against the local database; only outbound HTTP is stubbed.
import { SignJWT } from 'jose';
import { verifyEmail as verifyEmailEndpoint } from 'better-auth/api';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';

vi.hoisted(() => {
  process.env.RESEND_API_KEY = 're_test_not_a_real_key';
  process.env.EMAIL_FROM = 'Tickets <tickets@verify.test>';
  process.env.GOOGLE_CLIENT_ID = 'google-test.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'google-test-secret';
  delete process.env.REQUIRE_EMAIL_VERIFICATION;
});

import { authDb, db } from '@/lib/db';
import { users, verifications } from '@/db/schema';
import { claimSendSlot } from '@/lib/server/verification-email';
import { localDb } from './guard';
import {
  accountsOf,
  authContext,
  cookieOf,
  emailsTo,
  googleSignIn,
  openVerifyLink,
  PASSWORD,
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

const SIGN_IN_REQUIRED = /^\/email-verification\?error=SIGN_IN_REQUIRED(&redirect=[^#]+)?#token=[^#]+$/;

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

  it('keeps sign-up names out of the email and refuses multi-line or overlong names', async () => {
    const email = uniqueEmail('name');
    expect((await signUp(email, '/dashboard', PASSWORD, 'Support team\n\nYour account is locked, call 555')).status).toBe(400);
    expect((await signUp(email, '/dashboard', PASSWORD, 'x'.repeat(101))).status).toBe(400);
    expect(await userByEmail(email)).toBeUndefined();

    expect((await signUp(email, '/dashboard', PASSWORD, 'Visit evil.example now')).status).toBe(200);
    const [mail] = emailsTo(email);
    expect(mail.text).not.toContain('evil.example');
  });

  it('verifies only inside a session of the account; opened signed out or as someone else it changes nothing', async () => {
    const email = uniqueEmail('verify');
    const cookie = cookieOf(await signUp(email, '/invite/abc'));
    const link = verifyLinkFor(email);

    const signedOut = await openVerifyLink(link);
    expect(signedOut.status).toBe(302);
    const landing = signedOut.headers.get('location')!;
    expect(landing).toMatch(SIGN_IN_REQUIRED);
    expect(landing.startsWith('/email-verification?error=SIGN_IN_REQUIRED&redirect=%2Finvite%2Fabc#')).toBe(true);
    expect(decodeURIComponent(landing.split('#token=')[1])).toBe(link.searchParams.get('token'));
    expect(await sessionUserId(signedOut)).toBeNull();

    const other = cookieOf(await signUp(uniqueEmail('other')));
    expect((await openVerifyLink(link, other)).headers.get('location')).toMatch(SIGN_IN_REQUIRED);
    expect((await userByEmail(email)).emailVerified).toBe(false);

    // Other spellings of the request (a scanner's HEAD, trailing slash, encoded path) verify nothing either.
    for (const [path, method] of [
      ['/verify-email', 'HEAD'],
      ['/verify-email/', 'GET'],
      ['/verify%2Demail', 'GET'],
      ['//verify-email', 'GET'],
    ]) {
      const res = await authRequest(`${path}${link.search}`, { method });
      expect(res.headers.get('location') ?? '').not.toContain('verified=1');
    }
    expect((await userByEmail(email)).emailVerified).toBe(false);

    const holder = await openVerifyLink(link, cookie);
    expect(holder.headers.get('location')).toBe('/email-verification?verified=1&redirect=%2Finvite%2Fabc');
    expect((await userByEmail(email)).emailVerified).toBe(true);
    // autoSignInAfterVerification is off: no new session is minted by the link.
    expect(await sessionUserId(holder)).toBeNull();
  });

  it('refuses a verification through auth.api, or a direct endpoint call that skips hooks, without the holder’s session', async () => {
    const email = uniqueEmail('api');
    await signUp(email);
    const token = verifyLinkFor(email).searchParams.get('token')!;
    const { auth } = await import('@/lib/auth');
    await expect(auth.api.verifyEmail({ query: { token } })).rejects.toThrow();
    // The raw endpoint (no hooks): the check inside it (beforeEmailVerification) still refuses.
    await expect(verifyEmailEndpoint({ query: { token }, context: await auth.$context } as never)).rejects.toMatchObject({
      body: { code: 'SIGN_IN_REQUIRED' },
    });
    expect((await userByEmail(email)).emailVerified).toBe(false);
  });

  it('rejects a garbage token and an expired token without verifying anyone', async () => {
    const email = uniqueEmail('badlink');
    const cookie = cookieOf(await signUp(email));
    const callbackURL = encodeURIComponent('/email-verification?verified=1');

    const garbage = await authRequest(`/verify-email?token=not-a-token&callbackURL=${callbackURL}`, { method: 'GET', cookie });
    expect(garbage.headers.get('location')).toBe('/email-verification?verified=1&error=INVALID_TOKEN');

    const now = Math.floor(Date.now() / 1000);
    const expiredToken = await new SignJWT({ email })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now - 7200)
      .setExpirationTime(now - 3600)
      .sign(new TextEncoder().encode((await authContext()).secret));
    const expired = await authRequest(`/verify-email?token=${expiredToken}&callbackURL=${callbackURL}`, { method: 'GET', cookie });
    expect(expired.headers.get('location')).toBe('/email-verification?verified=1&error=TOKEN_EXPIRED');

    expect((await userByEmail(email)).emailVerified).toBe(false);
  });

  it('keeps a squatted address unlinkable: the owner opening the link signed out verifies nothing', async () => {
    // The attacker registers the victim's address with their own password.
    const victim = uniqueEmail('victim');
    await signUp(victim, '/dashboard', 'attacker-password-1');
    const { id: squatId } = await userByEmail(victim);
    const profile = { sub: `g-${squatId}`, email: victim, email_verified: true, name: 'Victim' };

    // The victim tries Google, is told the account isn't linked, opens the email signed out.
    expect((await googleSignIn(profile)).headers.get('location')).toBe('/login?error=account_not_linked');
    expect((await openVerifyLink(verifyLinkFor(victim))).headers.get('location')).toMatch(SIGN_IN_REQUIRED);
    expect((await userByEmail(victim)).emailVerified).toBe(false);

    // Google still refuses to join the squatter's account.
    const again = await googleSignIn(profile);
    expect(again.headers.get('location')).toBe('/login?error=account_not_linked');
    expect(await sessionUserId(again)).toBeNull();
    expect((await accountsOf(squatId)).map((a) => a.providerId)).toEqual(['credential']);
  });

  it('links Google to a password account after its holder verifies while signed in, to the same user', async () => {
    const email = uniqueEmail('link');
    await signUp(email);
    const { id: userId } = await userByEmail(email);
    const profile = { sub: `g-${userId}`, email, email_verified: true, name: 'Linked' };

    const refused = await googleSignIn(profile);
    expect(refused.headers.get('location')).toBe('/login?error=account_not_linked');
    expect(await sessionUserId(refused)).toBeNull();

    const signedIn = cookieOf(await signIn(email));
    await openVerifyLink(verifyLinkFor(email), signedIn);
    const linked = await googleSignIn(profile);
    expect(linked.headers.get('location')).toBe('/dashboard');
    expect(await sessionUserId(linked)).toBe(userId);
    expect((await accountsOf(userId)).map((a) => a.providerId).sort()).toEqual(['credential', 'google']);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.email, email));
    expect(count).toBe(1);
  });

  it('never links when Google itself does not vouch for the address', async () => {
    const email = uniqueEmail('unverified-google');
    const cookie = cookieOf(await signUp(email));
    await openVerifyLink(verifyLinkFor(email), cookie);
    const { id: userId } = await userByEmail(email);

    const res = await googleSignIn({ sub: `g-${userId}`, email, email_verified: false, name: 'Nope' });
    expect(res.headers.get('location')).toBe('/login?error=account_not_linked');
    expect((await accountsOf(userId)).map((a) => a.providerId)).toEqual(['credential']);
  });

  it('a link for a deleted and re-registered address verifies only the signed-in current holder', async () => {
    const email = uniqueEmail('recreated');
    await signUp(email);
    const oldLink = verifyLinkFor(email);
    await db.delete(users).where(eq(users.email, email));

    const cookie = cookieOf(await signUp(email, '/dashboard', 'second-holder-password'));
    expect((await openVerifyLink(oldLink)).headers.get('location')).toMatch(SIGN_IN_REQUIRED);
    expect((await userByEmail(email)).emailVerified).toBe(false);
    // Signed in as the current account (its password): accepted, as for any of its links.
    await openVerifyLink(oldLink, cookie);
    expect((await userByEmail(email)).emailVerified).toBe(true);
  });

  it('sends verification emails only to the signed-in holder, to a fixed page, at most one a minute', async () => {
    const email = uniqueEmail('resend');
    const cookie = cookieOf(await signUp(email));
    expect(emailsTo(email)).toHaveLength(1);

    // Signed out: refused, nothing sent (even after the cooldown).
    const { id } = await userByEmail(email);
    const expireCooldown = () =>
      db
        .update(verifications)
        .set({ expiresAt: sql`now() - interval '1 second'` })
        .where(eq(verifications.identifier, `verification-email-sent:${id}`));
    await expireCooldown();
    expect((await sendVerification(email, undefined, '/invite/attacker-invite')).status).toBe(401);
    expect(emailsTo(email)).toHaveLength(1);

    // Signed in: sent, and the caller's callbackURL is ignored.
    expect((await sendVerification(email, cookie, '/invite/attacker-invite')).status).toBe(200);
    expect(emailsTo(email)).toHaveLength(2);
    expect(verifyLinkFor(email).searchParams.get('callbackURL')).toBe('/email-verification?verified=1');

    // Inside the cooldown: dropped silently.
    expect((await sendVerification(email, cookie)).status).toBe(200);
    expect(emailsTo(email)).toHaveLength(2);
  });

  it('makes a send that races another one wait for it, so only one claims the cooldown slot', async () => {
    const userId = `concurrent-${crypto.randomUUID()}`;
    const identifier = `verification-email-sent:${userId}`;
    let second: Promise<boolean> | undefined;
    await authDb.transaction(async (tx) => {
      // The first send is mid-claim: it holds the lock and its marker isn't committed yet.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${identifier}, 0))`);
      await tx.insert(verifications).values({
        id: crypto.randomUUID(),
        identifier,
        value: '1',
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      second = claimSendSlot('verification-email-sent', userId);
      let settled = false;
      void second.then(
        () => (settled = true),
        () => (settled = true),
      );
      // Bounded wait until the second claim queues on the lock (or has already answered).
      for (let i = 0; i < 500 && !settled; i++) {
        const { rows } = await db.execute(sql`
          select 1 from pg_locks
          where locktype = 'advisory' and not granted
            and database = (select oid from pg_database where datname = current_database())
        `);
        if (rows.length) break;
      }
    });
    expect(await second).toBe(false);
  });

  it('cannot change the address, so a verified flag never moves to an unproven one', async () => {
    const email = uniqueEmail('change');
    const cookie = cookieOf(await signUp(email));
    await openVerifyLink(verifyLinkFor(email), cookie);
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
