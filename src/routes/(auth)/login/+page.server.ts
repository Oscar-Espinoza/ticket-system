// If a session already exists, bounce the user to ?redirect= (or /dashboard) so
// signed-in users never see the auth pages — except mid OAuth-provider flow
// with `prompt=login` (signed `sig` + `client_id`), which must re-authenticate.
// `?error=` (IdP / OAuth callbacks) becomes friendly copy; `?sso=1` opens the
// SSO form.

import { redirect } from '@sveltejs/kit';

import { signInProviders } from '@/lib/auth-providers';
import { emailVerificationAvailable } from '@/lib/email-verification';
import { safeRedirect } from '@/lib/safe-redirect';
import type { PageServerLoad } from './$types';

const SSO_REQUIRED_COPY = 'Your workspace requires single sign-on. Continue with SSO.';

const normalizeCode = (value: string) => value.toLowerCase().replace(/\s+/g, '_').slice(0, 80);

/**
 * account_not_linked: Better Auth found an account with that address but
 * links only when both sides are verified (auth.ts accountLinking). With
 * verification available the form lists the steps under this headline and
 * offers "Email me a verification link".
 */
function accountNotLinkedCopy(verificationAvailable: boolean): string {
  const headline =
    'An account with this email already exists, but its address isn’t verified yet, so Google or GitHub couldn’t be connected to it.';
  const sso = 'Using single sign-on? Ask your admin to add an email_verified attribute in the identity provider.';
  return verificationAvailable
    ? headline
    : `${headline} Sign in with your password instead, or ask your admin to verify your address. ${sso}`;
}

/** Error codes from Better Auth / the SSO plugin redirects (spaces or underscores). */
function signInErrorCopy(value: string | null, verificationAvailable: boolean): string | null {
  if (!value) return null;
  const code = normalizeCode(value);
  if (code.includes('email_domain_not_allowed')) {
    return 'Your identity provider signed you in with an email outside this workspace’s SSO domain.';
  }
  if (code.includes('account_not_linked')) {
    return accountNotLinkedCopy(verificationAvailable);
  }
  if (code.includes('unable_to_create_session') || code.includes('sso_required')) {
    return SSO_REQUIRED_COPY;
  }
  if (code.includes('signup_disabled')) return 'Sign-ups through single sign-on are disabled.';
  if (code.includes('invalid_state') || code.includes('state_mismatch')) {
    return 'Your sign-in expired. Please try again.';
  }
  return 'Sign-in failed. Try again or contact your workspace admin.';
}

export const load: PageServerLoad = async ({ url, locals }) => {
  // Invite links send people here with ?redirect=/invite/<token>.
  const redirectTo = safeRedirect(url.searchParams);
  const oauthReauth = !!url.searchParams.get('sig') && !!url.searchParams.get('client_id');
  if (locals.session && !oauthReauth) redirect(303, redirectTo);

  const verificationAvailable = emailVerificationAvailable();
  const errorParam = url.searchParams.get('error');
  const error = signInErrorCopy(errorParam, verificationAvailable);

  return {
    redirectTo,
    ...signInProviders(),
    initialError: error,
    // Offer "send verification email" next to the account_not_linked copy.
    offerVerification: verificationAvailable && !!errorParam && normalizeCode(errorParam).includes('account_not_linked'),
    emailVerificationAvailable: verificationAvailable,
    initialSso: url.searchParams.get('sso') === '1' || error === SSO_REQUIRED_COPY,
  };
};
