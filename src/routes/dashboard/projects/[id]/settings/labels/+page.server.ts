// Project settings › Labels. The project layout already checked membership
// and provides the labels via ProjectDataProvider; this page adds per-label
// counts of active issues. Members and up can manage labels (labels.ts is
// write-level); guests see a read-only list.

import { getLabelIssueCounts } from '@/lib/project-settings-read';
import { roleAllows } from '@/lib/roles';
import { loadViewerProject } from '../../project-load';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const { id } = params;
  const { project } = await loadViewerProject(id);

  const rows = await getLabelIssueCounts(id);

  return {
    projectId: id,
    projectName: project.name,
    counts: Object.fromEntries(rows.map((row) => [row.labelId, row.count])) as Record<
      string,
      number
    >,
    canEdit: roleAllows(project.role, 'write'),
  };
};
