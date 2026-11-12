// Where a verification link lands (Better Auth's /api/auth/verify-email
// redirects here; src/lib/email-verification.ts builds the link). Better Auth
// appends `error=TOKEN_EXPIRED | INVALID_TOKEN | USER_NOT_FOUND` on failure;
// the app's own hook sends `error=SIGN_IN_REQUIRED#token=…` when the link was
// opened outside a session of its account (src/lib/server/email-proof.ts):
// the page then asks for that account's password and finishes in the browser.
// After a success the signed-in user's cached session (5-minute cookie cache)
// still says "unverified", so it is re-read from the database here, which
// also rewrites the cookie.

import { redirect } from '@sveltejs/kit';

import { auth } from '@/lib/auth';
import {
  emailVerificationAvailable,
  passwordResetAvailable,
  SIGN_IN_REQUIRED,
  VERIFICATION_LINK_TTL_SECONDS,
  verifiedLanding,
} from '@/lib/email-verification';
import { safeRedirect } from '@/lib/safe-redirect';
import type { PageServerLoad } from './$types';

export type VerificationState = 'verified' | 'expired' | 'invalid' | 'sign-in' | 'pending';

function stateFor(error: string | null, verified: boolean): VerificationState {
  if (error === SIGN_IN_REQUIRED) return 'sign-in';
  if (error === 'TOKEN_EXPIRED') return 'expired';
  if (error) return 'invalid';
  return verified ? 'verified' : 'pending';
}

export const load: PageServerLoad = async ({ url, locals, request }) => {
  const redirectTo = safeRedirect(url.searchParams);
  const state = stateFor(url.searchParams.get('error'), url.searchParams.get('verified') === '1');

  let user = locals.user;
  if (user && !user.emailVerified && state === 'verified') {
    const fresh = await auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true },
    });
    user = fresh?.user ?? user;
  }
  // Opened directly: nothing to report.
  if (state === 'pending' && (!user || user.emailVerified)) redirect(303, user ? redirectTo : '/login');

  return {
    state,
    redirectTo,
    signedIn: !!user,
    signedInEmail: user?.email ?? null,
    linkHours: VERIFICATION_LINK_TTL_SECONDS / 3600,
    // Where the browser re-opens the link once signed in (same as the emailed link's callbackURL).
    verifiedPath: verifiedLanding(redirectTo),
    passwordResetAvailable: passwordResetAvailable(),
    // Only a signed-in, still-unverified user gets a "send a new link" button.
    resendEmail: user && !user.emailVerified && emailVerificationAvailable() ? user.email : null,
  };
};
