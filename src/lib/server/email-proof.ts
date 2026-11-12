// Better Auth hook bodies for email proof (wired in src/lib/auth.ts): what a
// verification link, a resend and a password reset may do. Rules and copy:
// src/lib/email-verification.ts; sending: src/lib/server/verification-email.ts.
//
// Server-only. Never import auth.ts / session.ts from here.
//
// Hooks see `ctx.path` as the endpoint's declared path ('/verify-email'),
// whatever URL reached it (trailing slash, encoding, HEAD), and Better Auth
// runs hooks for HTTP requests and for `auth.api.*` calls alike
// (better-auth/dist/api/to-auth-endpoints.mjs → dispatch.mjs). The verify
// check is repeated inside the endpoint (`beforeEmailVerification`), so even
// a direct endpoint call that skips hooks can't verify outside a session.

import type { GenericEndpointContext } from '@better-auth/core';
import { getCurrentAuthContext } from '@better-auth/core/context';
import { APIError, getAuthoritativeSessionFromCtx } from 'better-auth/api';
import { verifyJWT } from 'better-auth/crypto';

import { VERIFICATION_TOKEN_HEADER, validUserName } from '@/lib/auth-rules';
import { emailVerificationRequired, PASSWORD_RESET_PATH, signInRequiredLanding } from '@/lib/email-verification';
import { DEFAULT_AUTH_REDIRECT } from '@/lib/safe-redirect';
import { recordUserSecurityEvent } from '@/lib/audit';
import { assertPasswordSignInAllowed, claimUnverifiedAccount, enforcedSsoForEmail, SSO_REQUIRED } from '@/lib/sso';

const SIGN_IN_REQUIRED_ERROR = {
  code: 'SIGN_IN_REQUIRED',
  message: 'Sign in to this account with its password, then open the verification link again.',
} as const;

/** The verified claims of a verification token, or null (bad signature, expired, malformed). */
async function verificationClaims(token: unknown, secret: string) {
  if (typeof token !== 'string' || !token) return null;
  const payload = await verifyJWT<Record<string, unknown>>(token, secret);
  if (!payload || typeof payload.email !== 'string') return null;
  return { email: payload.email.toLowerCase(), changesEmail: payload.updateTo !== undefined };
}

/** The session of this request, read from the database (a revoked session doesn't count). */
async function currentUser(ctx: GenericEndpointContext) {
  const session = await getAuthoritativeSessionFromCtx(ctx);
  return session?.user ?? null;
}

/**
 * hooks.before on /verify-email: a link is honoured only inside a session of
 * the account it names, so verifying proves both the password (or another
 * sign-in of that account) and the mailbox. Opened anywhere else (signed out,
 * another account, a mail scanner prefetching it) it changes nothing and
 * sends the opener to the landing page's sign-in state. Returns that URL, or
 * null to let Better Auth handle the link (bad or expired tokens, unknown or
 * already-verified accounts: none of those verifies anyone).
 */
export async function verifyLinkRedirect(ctx: GenericEndpointContext): Promise<string | null> {
  const token = ctx.query?.token;
  const claims = await verificationClaims(token, ctx.context.secret);
  if (!claims) return null;
  const user = await currentUser(ctx);
  if (user && user.email.toLowerCase() === claims.email) return null;
  if (!claims.changesEmail) {
    const holder = await ctx.context.internalAdapter.findUserByEmail(claims.email);
    if (!holder || holder.user.emailVerified) return null;
  }
  return signInRequiredLanding(ctx.query?.callbackURL, token as string);
}

/**
 * emailVerification.beforeEmailVerification: the same rule inside the
 * endpoint, right before Better Auth flips the flag. Throws unless the
 * request's session belongs to `user`.
 */
export async function assertVerifierIsHolder(user: { id: string }) {
  let ctx: GenericEndpointContext;
  try {
    ctx = (await getCurrentAuthContext()) as GenericEndpointContext;
  } catch {
    throw APIError.from('FORBIDDEN', SIGN_IN_REQUIRED_ERROR);
  }
  const current = await currentUser(ctx);
  if (current?.id !== user.id) throw APIError.from('FORBIDDEN', SIGN_IN_REQUIRED_ERROR);
}

/**
 * hooks.before on /sign-in/email, REQUIRE_EMAIL_VERIFICATION on: the landing
 * page signs an unverified holder in with their password AND the link's
 * token (header VERIFICATION_TOKEN_HEADER, for exactly that address), so they
 * can then open the link inside their session. That is the only way an
 * unverified account gets a session while the switch is on, and it needs both
 * proofs. Returns the per-request context override, or null.
 */
export async function verifyingSignInContext(ctx: GenericEndpointContext) {
  if (!emailVerificationRequired()) return null;
  const claims = await verificationClaims(ctx.headers?.get(VERIFICATION_TOKEN_HEADER), ctx.context.secret);
  const email = ctx.body?.email;
  if (!claims || claims.changesEmail || typeof email !== 'string' || email.toLowerCase() !== claims.email) {
    return null;
  }
  const { options } = ctx.context;
  return { options: { emailAndPassword: { ...options.emailAndPassword, requireEmailVerification: false } } };
}

/**
 * hooks.before on /send-verification-email: only for the signed-in holder of
 * the address (Better Auth itself refuses another address), and the link
 * always lands on the dashboard: a caller can't pick where it goes.
 * Returns the body override.
 */
export async function resendVerificationBody(ctx: GenericEndpointContext) {
  const user = await currentUser(ctx);
  if (!user) {
    throw APIError.from('UNAUTHORIZED', {
      code: 'SIGN_IN_REQUIRED',
      message: 'Sign in to send yourself a verification link.',
    });
  }
  return { ...ctx.body, callbackURL: DEFAULT_AUTH_REDIRECT };
}

/** hooks.before on /sign-up/email and /update-user: names are short, single-line text. */
export function assertUserName(body: Record<string, unknown> | undefined) {
  if (!body || !('name' in body)) return;
  if (!validUserName(body.name)) {
    throw APIError.from('BAD_REQUEST', {
      code: 'INVALID_NAME',
      message: 'Name must be 1 to 100 characters on one line.',
    });
  }
}

/**
 * hooks.before on /request-password-reset: a domain with "Enforce SSO" can't
 * use a reset to get a password (password sign-in is refused for it the same
 * way). The reset page is fixed. Returns the body override.
 */
export async function passwordResetRequestBody(ctx: GenericEndpointContext) {
  await assertPasswordSignInAllowed(ctx.body?.email);
  return { ...ctx.body, redirectTo: PASSWORD_RESET_PATH };
}

/**
 * hooks.before on /reset-password: refuses the reset when the token's account
 * is now under "Enforce SSO" (turned on after the email was sent). Unknown or
 * used tokens are left to Better Auth (INVALID_TOKEN).
 */
export async function assertResetAllowed(ctx: GenericEndpointContext) {
  const token = ctx.body?.token ?? ctx.query?.token;
  if (typeof token !== 'string' || !token) return;
  const row = await ctx.context.internalAdapter.findVerificationValue(`reset-password:${token}`);
  if (!row) return;
  const user = await ctx.context.internalAdapter.findUserById(row.value);
  if (user && (await enforcedSsoForEmail(user.email.toLowerCase()))) {
    throw APIError.from('FORBIDDEN', SSO_REQUIRED);
  }
}

/**
 * emailAndPassword.onPasswordReset (the new password is stored; Better Auth
 * revokes every session right after, revokeSessionsOnPasswordReset). The link
 * came to the mailbox and set the password, so the address is now proven:
 * - unverified before: the real owner claims the account
 *   (claimUnverifiedAccount keeps the new password, removes the rest);
 * - verified before: an ordinary reset; two-factor stays and is asked for at
 *   the next sign-in (a reset never creates a session).
 */
export async function onPasswordReset({ user }: { user: { id: string; emailVerified: boolean } }) {
  if (!user.emailVerified) {
    await claimUnverifiedAccount(user.id, { keepPassword: true, via: 'password_reset' });
    return;
  }
  await recordUserSecurityEvent(user.id, {
    actorId: user.id,
    type: 'security.password_reset',
    summary: 'reset the password by email; every session was signed out',
  });
}
