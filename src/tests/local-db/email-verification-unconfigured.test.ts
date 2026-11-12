// No RESEND_API_KEY / EMAIL_FROM (a self-hosted instance without email), even
// with REQUIRE_EMAIL_VERIFICATION=true: nothing is sent, the resend and
// password-reset endpoints are off, and unverified accounts sign up and sign
// in exactly as before.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
});

import { localDb } from './guard';
import {
  sendVerification,
  sent,
  sessionUserId,
  signIn,
  signUp,
  stubOutboundHttp,
  uniqueEmail,
  userByEmail,
  cookieOf,
  requestReset,
} from './auth-email-flow';

describe.skipIf(!localDb)('email verification without email configured', () => {
  beforeAll(() => stubOutboundHttp());
  afterAll(() => {
    vi.unstubAllGlobals();
    delete process.env.REQUIRE_EMAIL_VERIFICATION;
  });

  it('sends nothing, offers no resend, and never blocks sign-in', async () => {
    const email = uniqueEmail('no-email');
    const signedUp = await signUp(email);
    expect(signedUp.status).toBe(200);
    const { id } = await userByEmail(email);
    expect(await sessionUserId(signedUp)).toBe(id);

    const resend = await sendVerification(email, cookieOf(signedUp));
    expect(resend.status).toBe(400);
    expect(((await resend.json()) as { code: string }).code).toBe('VERIFICATION_EMAIL_NOT_ENABLED');

    // No "Forgot password?" either: Better Auth refuses resets without a sender.
    const reset = await requestReset(email);
    expect(reset.status).toBe(400);
    expect(((await reset.json()) as { code: string }).code).toBe('RESET_PASSWORD_DISABLED');

    const signedIn = await signIn(email);
    expect(signedIn.status).toBe(200);
    expect(await sessionUserId(signedIn)).toBe(id);
    expect((await userByEmail(email)).emailVerified).toBe(false);
    expect(sent).toHaveLength(0);
  });
});
