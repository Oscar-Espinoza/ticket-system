// Login page load (port of src/app/(auth)/login/page.tsx).
//
// If a session already exists, bounce the user to ?redirect= (or /dashboard) so
// signed-in users never see the auth pages — except mid OAuth-provider flow
// with `prompt=login` (signed `sig` + `client_id`), which must re-authenticate.
// `?error=` (IdP / OAuth callbacks) becomes friendly copy; `?sso=1` opens the
// SSO form.

import { redirect } from '@sveltejs/kit';

import { safeRedirect } from '@/lib/safe-redirect';
import { firstParam, searchParam } from '../search-param';
import type { PageServerLoad } from './$types';

const SSO_REQUIRED_COPY = 'Your workspace requires single sign-on. Continue with SSO.';

/** Error codes from Better Auth / the SSO plugin redirects (spaces or underscores). */
function signInErrorCopy(value: string | undefined): string | null {
  if (!value) return null;
  const code = value.toLowerCase().replace(/\s+/g, '_').slice(0, 80);
  if (code.includes('email_domain_not_allowed')) {
    return 'Your identity provider signed you in with an email outside this workspace’s SSO domain.';
  }
  if (code.includes('account_not_linked')) {
    return 'An account with this email already exists and couldn’t be linked to single sign-on. Sign in another way, or ask your admin to add an email_verified attribute in the identity provider.';
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
  const redirectTo = safeRedirect(searchParam(url, 'redirect'));
  const oauthReauth = !!firstParam(url, 'sig') && !!firstParam(url, 'client_id');
  if (locals.session && !oauthReauth) redirect(303, redirectTo);

  const error = signInErrorCopy(firstParam(url, 'error'));

  return {
    redirectTo,
    initialError: error,
    initialSso: firstParam(url, 'sso') === '1' || error === SSO_REQUIRED_COPY,
  };
};
