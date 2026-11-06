// Second sign-in step for accounts with two-factor authentication. The twoFactorClient plugin sends
// the browser here (keeping ?redirect=) after a correct password; the pending
// sign-in lives in a short-lived signed cookie.

import { redirect } from '@sveltejs/kit';

import { safeRedirect } from '@/lib/safe-redirect';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
  const redirectTo = safeRedirect(url.searchParams);
  if (locals.session) redirect(303, redirectTo);
  return { redirectTo };
};
