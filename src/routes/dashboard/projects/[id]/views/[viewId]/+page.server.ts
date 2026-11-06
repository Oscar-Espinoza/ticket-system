// One saved view: the project's issues through the view's filters and display
// options. Visibility (owner, or shared + member) is checked in SQL.

import { error } from '@sveltejs/kit';

import { getFavoritedIds } from '@/lib/favorites';
import { readDefaultView } from '@/lib/issue-model';
import { getProjectIssues } from '@/lib/tickets';
import { getViewForUser } from '@/lib/views';
import { requireUser } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, cookies }) => {
  const { id: userId } = await requireUser();
  const { id, viewId } = params;

  const view = await getViewForUser(viewId, userId);
  if (!view || view.projectId !== id) error(404, 'Not found');

  const [issues, favorited] = await Promise.all([getProjectIssues(id, userId), getFavoritedIds(userId, 'view')]);

  return {
    view,
    issues,
    favorited: favorited.has(view.id),
    defaultView: readDefaultView(cookies),
  };
};
