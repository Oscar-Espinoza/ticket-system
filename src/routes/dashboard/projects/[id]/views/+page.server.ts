// A project's saved views (the viewer's own + ones shared with the project).
// The project layout already verified membership.
// (Port of src/app/dashboard/projects/[id]/views/page.tsx.)

import { redirect } from '@sveltejs/kit';

import { getFavoritedIds } from '@/lib/favorites';
import { getProjectData } from '@/lib/project-data';
import { roleAllows } from '@/lib/roles';
import { getVisibleViews } from '@/lib/views';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!locals.user) redirect(303, '/login');
  const userId = locals.user.id;
  const { id } = params;

  const [data, views, favorited] = await Promise.all([
    getProjectData(id, userId),
    getVisibleViews(userId, id),
    getFavoritedIds(userId, 'view'),
  ]);
  const canShare = data ? roleAllows(data.project.role, 'write') : false;
  // ViewListItem (navigation/view-list): SavedViewSummary + favorited + canShare.
  const items = views.map((view) => ({
    ...view,
    favorited: favorited.has(view.id),
    canShare,
  }));

  return { items };
};
