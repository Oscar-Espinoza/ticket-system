// Account settings index → Profile (port of src/app/dashboard/settings/page.tsx).

import { redirect } from '@sveltejs/kit';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
  redirect(303, '/dashboard/settings/profile');
};
