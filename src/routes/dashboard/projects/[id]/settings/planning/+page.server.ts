// Settings → Cycles & triage. Membership is checked first (non-members 404);
// the save action re-checks the admin role.

import { error } from '@sveltejs/kit';

import { getProjectCycles } from '@/lib/cycles';
import { getPlanningSettings } from '@/lib/project-settings-read';
import { roleAllows } from '@/lib/roles';
import { loadViewerProject } from '../../project-load';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const { id } = params;
  const { project: membership } = await loadViewerProject(id);

  const [project, cycleRows] = await Promise.all([getPlanningSettings(id), getProjectCycles(id)]);
  if (!project) error(404, 'Not found');

  return {
    projectId: id,
    initial: project,
    canEdit: roleAllows(membership.role, 'admin'),
    hasCycles: cycleRows.length > 0,
  };
};
