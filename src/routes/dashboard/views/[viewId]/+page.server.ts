// Short link for a saved view → its project page (views live in a project).

import { error, redirect } from '@sveltejs/kit';

import { getViewForUser } from '@/lib/views';
import { requireUser } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const user = await requireUser();
  const view = await getViewForUser(params.viewId, user.id);
  if (!view) error(404, 'Not found');
  // Project-less views have no page of their own yet; list them with the rest.
  redirect(303, view.projectId ? `/dashboard/projects/${view.projectId}/views/${view.id}` : '/dashboard/views');
};
