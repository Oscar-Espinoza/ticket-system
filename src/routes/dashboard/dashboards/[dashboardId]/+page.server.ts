// One dashboard: the owner's own, or one shared into a project the viewer
// belongs to. Widgets compute on the client from the scoped dataset.
// (port of src/app/dashboard/dashboards/[dashboardId]/page.tsx)

import { error, redirect } from '@sveltejs/kit';

import { getDashboardDataset, getDashboardForViewer } from '@/lib/dashboards';
import { roleAllows } from '@/lib/roles';
import { getSession } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const session = await getSession();
  if (!session?.user) redirect(303, '/login');
  const userId = session.user.id;

  const dashboard = await getDashboardForViewer(params.dashboardId, userId);
  if (!dashboard) error(404, 'Not found');
  const dataset = await getDashboardDataset(dashboard.projectId, userId);
  const isOwner = dashboard.ownerId === userId;
  const role = dashboard.projectId
    ? dataset.projects.find((p) => p.project.id === dashboard.projectId)?.project.role
    : undefined;

  return {
    dashboard,
    dataset,
    isOwner,
    canShare: isOwner && role !== undefined && roleAllows(role, 'write'),
  };
};
