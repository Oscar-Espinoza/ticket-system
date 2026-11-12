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

import { and, eq, gt, sql } from 'drizzle-orm';

import { users, verifications } from '@/db/schema';
import {
  ACCOUNT_CLAIM_ACK_FIELD,
  ACCOUNT_CLAIM_FAILED,
  ACCOUNT_CLAIM_NOT_ACKNOWLEDGED,
  type ClaimReport,
  type ResetClaimPreview,
} from '@/lib/account-claim';
import { NAME_RULE_MESSAGE, VERIFICATION_TOKEN_HEADER, validUserName } from '@/lib/auth-rules';
import { db } from '@/lib/db';
import { emailVerificationRequired, PASSWORD_RESET_PATH, signInRequiredLanding } from '@/lib/email-verification';
import { DEFAULT_AUTH_REDIRECT } from '@/lib/safe-redirect';
import { recordUserSecurityEvent } from '@/lib/audit';
import {
  assertPasswordSignInAllowed,
  claimInventory,
  claimUnverifiedAccount,
  enforcedSsoForEmail,
  revokeAllSessions,
  SSO_REQUIRED,
} from '@/lib/sso';

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
 * hooks.before on /sign-in/email, REQUIRE_EMAIL_VERIFICATION on, after
 * verifyingSignInContext declined: a correct password on an unverified
 * account makes Better Auth email a fresh link built from the request's
 * `callbackURL` (sendOnSignIn), and no session follows. Anyone who knows the
 * password could otherwise mail the owner a link that lands where they chose
 * (an invitation, say), so that link always lands on the dashboard, as a
 * resend's does. Verified accounts keep their callbackURL (it is only where
 * the sign-in form goes next). Returns the body override, or null.
 */
export async function unverifiedSignInBody(ctx: GenericEndpointContext) {
  if (!emailVerificationRequired()) return null;
  const email = ctx.body?.email;
  if (typeof email !== 'string' || email.length > 320) return null;
  const [holder] = await db
    .select({ emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  if (!holder || holder.emailVerified) return null;
  return { ...ctx.body, callbackURL: DEFAULT_AUTH_REDIRECT };
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

/** hooks.before on /sign-up/email and /update-user: the one name rule (auth-rules validUserName); Better Auth checks none. */
export function assertUserName(body: Record<string, unknown> | undefined) {
  if (!body || !('name' in body)) return;
  if (!validUserName(body.name)) {
    throw APIError.from('BAD_REQUEST', {
      code: 'INVALID_NAME',
      message: NAME_RULE_MESSAGE,
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

/** The account a reset token belongs to while the token still works, or null. */
async function resetTokenHolder(token: unknown) {
  if (typeof token !== 'string' || !token || token.length > 200) return null;
  const [row] = await db
    .select({ id: users.id, email: users.email, emailVerified: users.emailVerified })
    .from(verifications)
    .innerJoin(users, eq(users.id, verifications.value))
    .where(and(eq(verifications.identifier, `reset-password:${token}`), gt(verifications.expiresAt, sql`now()`)))
    .limit(1);
  return row ?? null;
}

/**
 * hooks.before on /reset-password:
 * - refuses the reset when the token's account is now under "Enforce SSO"
 *   (turned on after the email was sent);
 * - an UNVERIFIED account's reset secures it (onPasswordReset), which removes
 *   two-factor, API keys, connected apps and more; the reset page lists them
 *   (resetClaimPreview) and the request must carry ACCOUNT_CLAIM_ACK_FIELD:
 *   true, so no client, scripted or not, wipes an account without saying so.
 * Unknown or used tokens are left to Better Auth (INVALID_TOKEN).
 */
export async function assertResetAllowed(ctx: GenericEndpointContext) {
  const user = await resetTokenHolder(ctx.body?.token ?? ctx.query?.token);
  if (!user) return;
  if (await enforcedSsoForEmail(user.email.toLowerCase())) {
    throw APIError.from('FORBIDDEN', SSO_REQUIRED);
  }
  if (!user.emailVerified && ctx.body?.[ACCOUNT_CLAIM_ACK_FIELD] !== true) {
    throw APIError.from('BAD_REQUEST', {
      code: ACCOUNT_CLAIM_NOT_ACKNOWLEDGED,
      message:
        'This account’s email address was never verified, so resetting its password removes two-factor, API keys, connected apps, linked sign-ins, the Slack link, push subscriptions and pending invitations. Confirm that to continue.',
    });
  }
}

/**
 * The reset page's question before it asks for a new password: does this
 * link secure an unverified account, and what is there to remove? Answers
 * { claim: false } alike for an unknown, used or expired token, a verified
 * account and a domain under "Enforce SSO", so a caller without a working
 * link learns nothing.
 */
export async function resetClaimPreview(token: unknown): Promise<ResetClaimPreview> {
  const user = await resetTokenHolder(token);
  if (!user || user.emailVerified || (await enforcedSsoForEmail(user.email.toLowerCase()))) {
    return { claim: false };
  }
  return { claim: true, removes: await claimInventory(user.id, { keepPassword: true }) };
}

/** What a reset's claim removed, by request (onPasswordReset → hooks.after on /reset-password). */
const claimedByRequest = new WeakMap<object, ClaimReport>();

/**
 * emailAndPassword.onPasswordReset (the new password is stored; Better Auth
 * revokes every session right after, revokeSessionsOnPasswordReset). The link
 * came to the mailbox and set the password, so the address is now proven:
 * - unverified before: the real owner claims the account
 *   (claimUnverifiedAccount keeps the new password, removes the rest; the
 *   request was acknowledged, assertResetAllowed). If the claim fails it
 *   fails closed: every session is revoked anyway, the account stays
 *   unverified (the claim is one transaction) so the next reset claims
 *   again, and the request answers ACCOUNT_CLAIM_FAILED;
 * - verified before: an ordinary reset; two-factor stays and is asked for at
 *   the next sign-in (a reset never creates a session).
 */
export async function onPasswordReset({ user }: { user: { id: string; emailVerified: boolean } }) {
  if (!user.emailVerified) {
    let removed: ClaimReport;
    try {
      removed = await claimUnverifiedAccount(user.id, { keepPassword: true, via: 'password_reset' });
    } catch (err) {
      console.error('[email-proof] securing the account after a reset failed', err);
      await revokeAllSessions(user.id);
      throw APIError.from('INTERNAL_SERVER_ERROR', {
        code: ACCOUNT_CLAIM_FAILED,
        message:
          'Your new password is set, but securing the account didn’t finish. Ask for a new reset link and use it to finish.',
      });
    }
    try {
      const ctx = await getCurrentAuthContext();
      claimedByRequest.set(ctx.context, removed);
    } catch {
      // Called outside an endpoint: nobody reads the response's list.
    }
    return;
  }
  await recordUserSecurityEvent(user.id, {
    actorId: user.id,
    type: 'security.password_reset',
    summary: 'reset the password by email; every session was signed out',
  });
}

/**
 * hooks.after on /reset-password: a reset that secured the account answers
 * { status: true, claimed: ClaimReport } so the page can list what was
 * removed. Returns the new body, or null to leave the response alone.
 */
export function resetResponseWithClaim(ctx: GenericEndpointContext) {
  const claimed = claimedByRequest.get(ctx.context);
  if (!claimed) return null;
  claimedByRequest.delete(ctx.context);
  return { status: true, claimed };
}
