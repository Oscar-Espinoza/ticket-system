// Email proof rules (verification links and password reset), read by auth.ts,
// the login / dashboard / settings loads and the tests. Server-only (reads
// process.env), no `$app/*` or DB imports. Sending (and its per-user
// cooldowns) lives in src/lib/server/verification-email.ts; the Better Auth
// hook bodies live in src/lib/server/email-proof.ts.
//
// Why it exists: Better Auth links a Google/GitHub sign-in to an existing
// account only when BOTH sides are verified (auth.ts `accountLinking`), so a
// password account has to prove its address before it can be linked.
//
// - "Verified" means the holder proved the password AND the mailbox: a link
//   is honoured only inside a session of that same account (or, with
//   REQUIRE_EMAIL_VERIFICATION on, on the landing page's password form). A
//   link alone never verifies, so a squatter's account can't be verified by
//   the real owner clicking (or a mail scanner prefetching) the link.
// - A completed password reset also proves both (it sets the password from a
//   link sent to the mailbox), so it verifies the address too.
// - Verification and reset are available only when email can really be sent
//   (RESEND_API_KEY + EMAIL_FROM, see src/lib/email.ts). Without it nothing
//   changes: no email, no banner, no resend button, no "Forgot password?".
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

/**
 * Landing-page error when a link is opened outside a session of its account.
 * The token travels in the URL fragment (`#token=`), which browsers never send
 * to a server or in a Referer.
 */
export const SIGN_IN_REQUIRED = 'SIGN_IN_REQUIRED';

/** The app page a password-reset link opens (the token is in the fragment). */
export const PASSWORD_RESET_PATH = '/reset-password';

/** How long a password-reset link works (Better Auth's `resetPasswordTokenExpiresIn`, seconds). */
export const PASSWORD_RESET_TTL_SECONDS = 60 * 60;

/** Verification emails can be sent (and so the banner / resend actions show). */
export const emailVerificationAvailable = (env: Env = process.env) => emailConfigured(env);

/** "Forgot password?" works: reset links can be emailed. */
export const passwordResetAvailable = (env: Env = process.env) => emailConfigured(env);

/** REQUIRE_EMAIL_VERIFICATION=true, honoured only while verification emails can be sent. */
export function emailVerificationRequired(env: Env = process.env): boolean {
  return env.REQUIRE_EMAIL_VERIFICATION?.trim().toLowerCase() === 'true' && emailVerificationAvailable(env);
}

/** The landing page's `redirect` destination carried by a verify link's callbackURL. */
function landingDestination(callbackURL: string | null | undefined): string {
  if (!callbackURL) return DEFAULT_AUTH_REDIRECT;
  try {
    const url = new URL(callbackURL, 'http://app.invalid');
    return safeRedirect(url.searchParams);
  } catch {
    return DEFAULT_AUTH_REDIRECT;
  }
}

function landing(params: Record<string, string>, destination: string): string {
  const query = new URLSearchParams(params);
  if (destination !== DEFAULT_AUTH_REDIRECT) query.set('redirect', destination);
  return `${VERIFICATION_LANDING_PATH}?${query}`;
}

/**
 * Better Auth's verify URL with its `callbackURL` pointed at the landing page,
 * carrying the requested destination as `redirect` (only safe app paths
 * survive, see safe-redirect.ts).
 */
export function verificationLink(betterAuthUrl: string): string {
  const link = new URL(betterAuthUrl);
  const destination = safeRedirect(new URLSearchParams({ redirect: link.searchParams.get('callbackURL') ?? '' }));
  link.searchParams.set('callbackURL', landing({ verified: '1' }, destination));
  return link.toString();
}

/**
 * Where a link opened outside its account's session goes: the landing page's
 * sign-in state, the token in the fragment so the page can finish once the
 * opener has signed in. Built only from the landing path and a safe
 * destination (never from the request's callbackURL as given).
 */
export function signInRequiredLanding(callbackURL: string | null | undefined, token: string): string {
  return `${landing({ error: SIGN_IN_REQUIRED }, landingDestination(callbackURL))}#token=${encodeURIComponent(token)}`;
}

/** The verify link's landing URL after success, for a given destination. */
export const verifiedLanding = (destination: string) => landing({ verified: '1' }, destination);

/**
 * The reset link: the app page with the token in the fragment, so it never
 * reaches a server log or a Referer (Better Auth's own GET
 * /reset-password/:token would put it in a query string).
 */
export function passwordResetLink(betterAuthUrl: string, token: string): string {
  return `${new URL(betterAuthUrl).origin}${PASSWORD_RESET_PATH}#token=${encodeURIComponent(token)}`;
}

// The emails carry no user-supplied text besides the address itself: a
// sign-up `name` would let anyone send app-branded mail with their own words
// to any address.

/** The verification email (plain text, like the invitation emails). */
export function verificationEmail(user: { email: string }, url: string) {
  const hours = VERIFICATION_LINK_TTL_SECONDS / 3600;
  return {
    to: user.email,
    subject: 'Verify your email address',
    text: [
      'Hi,',
      '',
      `Confirm that ${user.email} is your email address:`,
      url,
      '',
      `The link expires in ${hours} hours. It only works while you are signed in to this account with its password (the page asks you to sign in if you aren't). Once your address is verified you can also sign in with Google or GitHub using it.`,
      '',
      'If you didn’t create this account, someone else used your address: don’t sign in to it. To take the address back, use "Forgot password?" on the sign-in page; resetting the password signs everyone else out and removes what they set up.',
    ].join('\n'),
  };
}

/** The password-reset email. */
export function passwordResetEmail(user: { email: string }, url: string) {
  const minutes = PASSWORD_RESET_TTL_SECONDS / 60;
  return {
    to: user.email,
    subject: 'Reset your password',
    text: [
      'Hi,',
      '',
      `Someone asked to reset the password of the account for ${user.email}. To choose a new password, open:`,
      url,
      '',
      `The link works once, for ${minutes} minutes. Resetting signs out every session of this account and verifies the address.`,
      '',
      'If you didn’t ask for this, ignore this email: your password stays as it is.',
    ].join('\n'),
  };
}
