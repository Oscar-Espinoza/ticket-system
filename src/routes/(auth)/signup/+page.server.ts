// Signup page load (port of src/app/(auth)/signup/page.tsx).
//
// Already-authenticated users go to ?redirect= (or /dashboard); otherwise the
// client signup form renders.

import { redirect } from '@sveltejs/kit';

import { safeRedirect } from '@/app/(auth)/safe-redirect';
import { searchParam } from '../search-param';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
  // Invite links send people here with ?redirect=/invite/<token>.
  const redirectTo = safeRedirect(searchParam(url, 'redirect'));
  if (locals.session) redirect(303, redirectTo);
  return { redirectTo };
};
