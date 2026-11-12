// "Forgot password?": only when reset emails can be sent (otherwise /login).
// Signed-in users may use it too (it signs out every session once completed).

import { redirect } from '@sveltejs/kit';

import { passwordResetAvailable } from '@/lib/email-verification';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  if (!passwordResetAvailable()) redirect(303, '/login');
  return {};
};
