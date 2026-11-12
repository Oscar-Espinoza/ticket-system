// REQUIRE_EMAIL_VERIFICATION=true with email configured: sign-up sends the
// link but doesn't sign in, password sign-in is refused until the address is
// verified, then works. Real Better Auth against the local database.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.RESEND_API_KEY = 're_test_not_a_real_key';
  process.env.EMAIL_FROM = 'Tickets <tickets@verify.test>';
  process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
});

import { localDb } from './guard';
import {
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

  it('refuses password sign-in until the emailed link is opened', async () => {
    const email = uniqueEmail('required');
    const signedUp = await signUp(email);
    expect(signedUp.status).toBe(200);
    expect(((await signedUp.json()) as { token: string | null }).token).toBeNull();
    expect(await sessionUserId(signedUp)).toBeNull();
    expect(emailsTo(email)).toHaveLength(1);

    const refused = await signIn(email);
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { code: string }).code).toBe('EMAIL_NOT_VERIFIED');
    expect(await sessionUserId(refused)).toBeNull();

    await openVerifyLink(verifyLinkFor(email));
    const allowed = await signIn(email);
    expect(allowed.status).toBe(200);
    expect(await sessionUserId(allowed)).toBe((await userByEmail(email)).id);
  });
});
