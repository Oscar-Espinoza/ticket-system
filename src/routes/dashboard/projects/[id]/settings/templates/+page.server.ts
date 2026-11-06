import { readIssueTemplates } from '@/lib/issue-templates';
import { roleAllows } from '@/lib/roles';
import { loadViewerProject } from '../../project-load';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const { id } = params;
  const { project: membership } = await loadViewerProject(id);

  return {
    projectId: id,
    templates: await readIssueTemplates(id),
    canEdit: roleAllows(membership.role, 'write'),
  };
};
