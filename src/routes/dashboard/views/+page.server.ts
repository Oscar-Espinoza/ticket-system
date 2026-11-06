// Saved views across every project the viewer belongs to: their own, then
// views other members shared.

import { getProjectsForUser } from '@/lib/components/project-list.server';
import { getFavoritedIds } from '@/lib/favorites';
import { roleAllows } from '@/lib/roles';
import { getVisibleViews } from '@/lib/views';
import { requireUser } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const { id: userId } = await requireUser();

  const [views, favorited, projects] = await Promise.all([
    getVisibleViews(userId),
    getFavoritedIds(userId, 'view'),
    getProjectsForUser(userId),
  ]);
  const roles = new Map(projects.map((p) => [p.id, p.role]));
  // ViewListItem (navigation/view-list): SavedViewSummary + favorited + canShare.
  const items = views.map((view) => {
    const role = view.projectId ? roles.get(view.projectId) : undefined;
    return {
      ...view,
      favorited: favorited.has(view.id),
      canShare: role ? roleAllows(role, 'write') : false,
    };
  });

  return {
    empty: items.length === 0,
    mine: items.filter((v) => v.isOwner),
    shared: items.filter((v) => !v.isOwner),
  };
};
