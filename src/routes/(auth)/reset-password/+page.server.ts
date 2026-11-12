// Where a reset link opens (src/lib/email-verification.ts passwordResetLink).
// The token is in the URL fragment, read by the page in the browser.

import { redirect } from '@sveltejs/kit';

import { passwordResetAvailable } from '@/lib/email-verification';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  if (!passwordResetAvailable()) redirect(303, '/login');
  return {};
};
