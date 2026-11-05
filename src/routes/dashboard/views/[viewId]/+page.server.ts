// Short link for a saved view → its project page (views live in a project).
// (Port of src/app/dashboard/views/[viewId]/page.tsx.)

import { error, redirect } from '@sveltejs/kit';

import { getViewForUser } from '@/lib/views';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.user) redirect(303, '/login');
  const view = await getViewForUser(params.viewId, locals.user.id);
  if (!view) error(404, 'Not found');
  // Project-less views have no page of their own yet; list them with the rest.
  redirect(303, view.projectId ? `/dashboard/projects/${view.projectId}/views/${view.id}` : '/dashboard/views');
};
