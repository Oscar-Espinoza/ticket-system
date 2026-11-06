// A project's saved views (the viewer's own + ones shared with the project).
// The project layout already verified membership.

import { getFavoritedIds } from '@/lib/favorites';
import { roleAllows } from '@/lib/roles';
import { getVisibleViews } from '@/lib/views';
import { requireUser } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent }) => {
  const { id: userId } = await requireUser();
  const { id } = params;

  const [{ projectData }, views, favorited] = await Promise.all([
    parent(),
    getVisibleViews(userId, id),
    getFavoritedIds(userId, 'view'),
  ]);
  const canShare = roleAllows(projectData.project.role, 'write');
  // ViewListItem (navigation/view-list): SavedViewSummary + favorited + canShare.
  const items = views.map((view) => ({
    ...view,
    favorited: favorited.has(view.id),
    canShare,
  }));

  return { items };
};
