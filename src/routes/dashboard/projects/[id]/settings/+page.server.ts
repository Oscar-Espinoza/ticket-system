import { redirect } from '@sveltejs/kit';

import { projectHref } from '@/components/app-shell/routes';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
  redirect(303, projectHref(params.id, 'settings/general'));
};
