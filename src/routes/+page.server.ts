// Port of src/app/page.tsx: the root URL always goes to the dashboard.
import { redirect } from '@sveltejs/kit';

import type { PageServerLoad } from './$types';

// redirect() throws — never wrap it in try/catch.
export const load: PageServerLoad = () => {
  redirect(303, '/dashboard');
};
