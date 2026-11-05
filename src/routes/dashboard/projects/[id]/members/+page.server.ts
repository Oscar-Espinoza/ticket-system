// Members moved under project settings; keep old links working
// (port of src/app/dashboard/projects/[id]/members/page.tsx).

import { redirect } from '@sveltejs/kit';

import { projectHref } from '@/lib/components/app-shell/routes';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
  redirect(303, projectHref(params.id, 'settings/members'));
};
