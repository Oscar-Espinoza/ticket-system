import { redirect } from '@sveltejs/kit';

import { projectHref } from '@/lib/components/app-shell/routes';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
  redirect(303, projectHref(params.id, 'settings/general'));
};
