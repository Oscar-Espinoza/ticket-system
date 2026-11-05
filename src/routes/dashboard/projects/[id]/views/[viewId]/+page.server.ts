// One saved view: the project's issues through the view's filters and display
// options. Visibility (owner, or shared + member) is checked in SQL.
// (Port of src/app/dashboard/projects/[id]/views/[viewId]/page.tsx.)

import { error, redirect } from '@sveltejs/kit';

import { getFavoritedIds } from '@/lib/favorites';
import { VIEW_COOKIE } from '@/lib/issue-model';
import { getProjectIssues } from '@/lib/tickets';
import { getViewForUser } from '@/lib/views';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, cookies }) => {
  if (!locals.user) redirect(303, '/login');
  const userId = locals.user.id;
  const { id, viewId } = params;

  const view = await getViewForUser(viewId, userId);
  if (!view || view.projectId !== id) error(404, 'Not found');

  const [issues, favorited] = await Promise.all([getProjectIssues(id, userId), getFavoritedIds(userId, 'view')]);

  return {
    view,
    issues,
    favorited: favorited.has(view.id),
    defaultView: cookies.get(VIEW_COOKIE),
  };
};
