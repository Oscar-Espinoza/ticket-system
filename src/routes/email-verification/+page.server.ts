// Where a verification link lands (Better Auth's /api/auth/verify-email
// redirects here; src/lib/email-verification.ts builds the link). Better Auth
// appends `error=TOKEN_EXPIRED | INVALID_TOKEN | USER_NOT_FOUND` on failure.
// After a success the signed-in user's cached session (5-minute cookie cache)
// still says "unverified", so it is re-read from the database here, which
// also rewrites the cookie.

import { redirect } from '@sveltejs/kit';

import { auth } from '@/lib/auth';
import { emailVerificationAvailable, VERIFICATION_LINK_TTL_SECONDS } from '@/lib/email-verification';
import { safeRedirect } from '@/lib/safe-redirect';
import type { PageServerLoad } from './$types';

export type VerificationState = 'verified' | 'expired' | 'invalid' | 'pending';

export const load: PageServerLoad = async ({ url, locals, request }) => {
  const redirectTo = safeRedirect(url.searchParams);
  const error = url.searchParams.get('error');
  const state: VerificationState = error
    ? error === 'TOKEN_EXPIRED'
      ? 'expired'
      : 'invalid'
    : url.searchParams.get('verified') === '1'
      ? 'verified'
      : 'pending';

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
    linkHours: VERIFICATION_LINK_TTL_SECONDS / 3600,
    // Only a signed-in, still-unverified user gets a "send a new link" button.
    resendEmail: user && !user.emailVerified && emailVerificationAvailable() ? user.email : null,
  };
};
