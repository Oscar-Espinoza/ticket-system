// If a session already exists, bounce the user to ?redirect= (or /dashboard) so
// signed-in users never see the auth pages — except mid OAuth-provider flow
// with `prompt=login` (signed `sig` + `client_id`), which must re-authenticate.
// `?error=` (IdP / OAuth callbacks) becomes friendly copy; `?sso=1` opens the
// SSO form.

import { redirect } from '@sveltejs/kit';

import { signInProviders } from '@/lib/auth-providers';
import { emailVerificationAvailable, passwordResetAvailable } from '@/lib/email-verification';
import { m } from '@/lib/i18n';
import { safeRedirect } from '@/lib/safe-redirect';
import type { PageServerLoad } from './$types';

const normalizeCode = (value: string) => value.toLowerCase().replace(/\s+/g, '_').slice(0, 80);

/**
 * account_not_linked: Better Auth found an account with that address but
 * links only when both sides are verified (auth.ts accountLinking). With
 * verification available the form lists the steps under this headline (sign
 * in, verify from the banner, continue with Google/GitHub) and offers
 * "Forgot password?" to someone who never set that password. No verification
 * email can be requested from here while signed out.
 */
function accountNotLinkedCopy(verificationAvailable: boolean): string {
  const headline = m.shared_login_account_not_linked();
  return verificationAvailable
    ? headline
    : `${headline} ${m.shared_login_account_not_linked_password()} ${m.shared_login_account_not_linked_sso()}`;
}

/** Error codes from Better Auth / the SSO plugin redirects (spaces or underscores). */
function signInErrorCopy(value: string | null, verificationAvailable: boolean): string | null {
  if (!value) return null;
  const code = normalizeCode(value);
  if (code.includes('email_domain_not_allowed')) {
    return m.shared_login_domain_not_allowed();
  }
  if (code.includes('account_not_linked')) {
    return accountNotLinkedCopy(verificationAvailable);
  }
  if (code.includes('unable_to_create_session') || code.includes('sso_required')) {
    return m.shared_login_sso_required();
  }
  if (code.includes('signup_disabled')) return m.shared_login_signup_disabled();
  if (code.includes('invalid_state') || code.includes('state_mismatch')) {
    return m.shared_login_expired();
  }
  return m.shared_login_failed();
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
    // Show the account_not_linked steps under the headline.
    offerVerification: verificationAvailable && !!errorParam && normalizeCode(errorParam).includes('account_not_linked'),
    passwordResetAvailable: passwordResetAvailable(),
    initialSso: url.searchParams.get('sso') === '1' || error === m.shared_login_sso_required(),
  };
};
