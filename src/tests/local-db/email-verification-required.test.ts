// REQUIRE_EMAIL_VERIFICATION=true with email configured: sign-up sends the
// link but doesn't sign in, password sign-in is refused until the address is
// verified (a correct password gets a fresh link), and the link's landing page
// gets the holder in with password + link: a sign-in carrying the link's token
// for that same address, then the link opened inside that session.
// Real Better Auth against the local database.
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.RESEND_API_KEY = 're_test_not_a_real_key';
  process.env.EMAIL_FROM = 'Tickets <tickets@verify.test>';
  process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
});

import { db } from '@/lib/db';
import { verifications } from '@/db/schema';
import { VERIFICATION_TOKEN_HEADER } from '@/lib/auth-rules';
import { localDb } from './guard';
import {
  cookieOf,
  emailsTo,
  openVerifyLink,
  sessionUserId,
  signIn,
  signUp,
  stubOutboundHttp,
  uniqueEmail,
  userByEmail,
  verifyLinkFor,
} from './auth-email-flow';

describe.skipIf(!localDb)('REQUIRE_EMAIL_VERIFICATION=true (email configured)', () => {
  beforeAll(() => stubOutboundHttp());
  afterAll(() => {
    vi.unstubAllGlobals();
    for (const key of ['RESEND_API_KEY', 'EMAIL_FROM', 'REQUIRE_EMAIL_VERIFICATION']) delete process.env[key];
  });

  it('refuses password sign-in until the holder signs in with password + link and opens it', async () => {
    const email = uniqueEmail('required');
    const signedUp = await signUp(email);
    expect(signedUp.status).toBe(200);
    expect(((await signedUp.json()) as { token: string | null }).token).toBeNull();
    expect(await sessionUserId(signedUp)).toBeNull();
    expect(emailsTo(email)).toHaveLength(1);
    const link = verifyLinkFor(email);
    const token = link.searchParams.get('token')!;

    const refused = await signIn(email);
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { code: string }).code).toBe('EMAIL_NOT_VERIFIED');
    expect(await sessionUserId(refused)).toBeNull();

    // The link alone (signed out) verifies nothing.
    expect((await openVerifyLink(link)).headers.get('location')).toMatch(/error=SIGN_IN_REQUIRED/);
    expect((await userByEmail(email)).emailVerified).toBe(false);

    // The token without the password, or for another address, opens nothing.
    expect((await signIn(email, 'wrong-password-123', { [VERIFICATION_TOKEN_HEADER]: token })).status).toBe(401);
    const other = uniqueEmail('required-other');
    await signUp(other);
    expect((await signIn(other, undefined, { [VERIFICATION_TOKEN_HEADER]: token })).status).toBe(403);

    // Password + the link's token: a session, then the link inside it verifies.
    const landing = await signIn(email, undefined, { [VERIFICATION_TOKEN_HEADER]: token });
    expect(landing.status).toBe(200);
    expect(await sessionUserId(landing)).toBe((await userByEmail(email)).id);
    await openVerifyLink(link, cookieOf(landing));
    expect((await userByEmail(email)).emailVerified).toBe(true);

    const allowed = await signIn(email);
    expect(allowed.status).toBe(200);
  });

  it('emails a fresh link when an unverified holder signs in with the right password', async () => {
    const email = uniqueEmail('required-resend');
    await signUp(email);
    const { id } = await userByEmail(email);
    await db
      .update(verifications)
      .set({ expiresAt: sql`now() - interval '1 second'` })
      .where(eq(verifications.identifier, `verification-email-sent:${id}`));

    expect((await signIn(email, 'wrong-password-123')).status).toBe(401);
    expect(emailsTo(email)).toHaveLength(1);
    expect((await signIn(email)).status).toBe(403);
    expect(emailsTo(email)).toHaveLength(2);
  });
});
