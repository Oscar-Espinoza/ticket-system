// Project settings › Workflow. The project layout already checked membership
// and provides the states via ProjectDataProvider; this page adds per-state
// issue counts. Editing is admin-only (the actions re-check).

import { getStateIssueCounts } from '@/lib/project-settings-read';
import { roleAllows } from '@/lib/roles';
import { loadViewerProject } from '../../project-load';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const { id } = params;
  const { project } = await loadViewerProject(id);

  const rows = await getStateIssueCounts(id);

  return {
    projectId: id,
    projectName: project.name,
    counts: Object.fromEntries(rows.map((row) => [row.stateId, row.count])) as Record<
      string,
      number
    >,
    canEdit: roleAllows(project.role, 'admin'),
  };
};
