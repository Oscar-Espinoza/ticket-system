// One dashboard: the owner's own, or one shared into a project the viewer
// belongs to. Widgets compute on the client from the scoped dataset.

import { error } from '@sveltejs/kit';

import { getDashboardDataset, getDashboardForViewer } from '@/lib/dashboards';
import { roleAllows } from '@/lib/roles';
import { requireUser } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const { id: userId } = await requireUser();

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
