// Email verification rules, read by auth.ts, the login / dashboard / settings
// loads and the tests. Server-only (reads process.env), no `$app/*` or DB
// imports. Sending (and its per-user cooldown) lives in
// src/lib/server/verification-email.ts.
//
// Why it exists: Better Auth links a Google/GitHub sign-in to an existing
// account only when BOTH sides are verified (auth.ts `accountLinking`), so a
// password account has to prove its address before it can be linked.
//
// - Verification is available only when email can really be sent
//   (RESEND_API_KEY + EMAIL_FROM, see src/lib/email.ts). Without it nothing
//   changes: no email, no banner, no resend button, sign-in as before.
// - REQUIRE_EMAIL_VERIFICATION=true (off by default) refuses password sign-in
//   to unverified accounts, and only takes effect while verification is
//   available, so an instance without email can never lock everyone out.

import { emailConfigured } from '@/lib/email';
import { DEFAULT_AUTH_REDIRECT, safeRedirect } from '@/lib/safe-redirect';

type Env = Record<string, string | undefined>;

/** The app page a verification link lands on (Better Auth appends `&error=<CODE>` on failure). */
export const VERIFICATION_LANDING_PATH = '/email-verification';

/** How long a verification link works (Better Auth's `emailVerification.expiresIn`, seconds). */
export const VERIFICATION_LINK_TTL_SECONDS = 24 * 60 * 60;

/** Verification emails can be sent (and so the banner / resend actions show). */
export const emailVerificationAvailable = (env: Env = process.env) => emailConfigured(env);

/** REQUIRE_EMAIL_VERIFICATION=true, honoured only while verification emails can be sent. */
export function emailVerificationRequired(env: Env = process.env): boolean {
  return env.REQUIRE_EMAIL_VERIFICATION?.trim().toLowerCase() === 'true' && emailVerificationAvailable(env);
}

/**
 * Better Auth's verify URL with its `callbackURL` pointed at the landing page,
 * carrying the requested destination as `redirect` (only safe app paths
 * survive, see safe-redirect.ts).
 */
export function verificationLink(betterAuthUrl: string): string {
  const link = new URL(betterAuthUrl);
  const destination = safeRedirect(new URLSearchParams({ redirect: link.searchParams.get('callbackURL') ?? '' }));
  const landing = new URLSearchParams({ verified: '1' });
  if (destination !== DEFAULT_AUTH_REDIRECT) landing.set('redirect', destination);
  link.searchParams.set('callbackURL', `${VERIFICATION_LANDING_PATH}?${landing}`);
  return link.toString();
}

/** The verification email (plain text, like the invitation emails). */
export function verificationEmail(user: { name?: string | null; email: string }, url: string) {
  const hours = VERIFICATION_LINK_TTL_SECONDS / 3600;
  return {
    to: user.email,
    subject: 'Verify your email address',
    text: [
      `Hi ${user.name?.trim() || 'there'},`,
      '',
      `Confirm that ${user.email} is your email address:`,
      url,
      '',
      `The link expires in ${hours} hours. Once your address is verified you can also sign in with Google or GitHub using it.`,
      '',
      'If you didn’t create this account, don’t open the link: someone else used your address. Ignore this email and the account stays unverified.',
    ].join('\n'),
  };
}
