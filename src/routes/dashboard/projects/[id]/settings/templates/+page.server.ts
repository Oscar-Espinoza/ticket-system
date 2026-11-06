import { error } from '@sveltejs/kit';

import { listTemplates } from '@/lib/server/actions/templates';
import { roleAllows } from '@/lib/roles';
import { loadViewerProject } from '../../project-load';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const { id } = params;
  const { project: membership } = await loadViewerProject(id);

  const result = await listTemplates(id);
  if (!result.ok) error(404, 'Not found');

  return {
    projectId: id,
    templates: result.templates,
    canEdit: roleAllows(membership.role, 'write'),
  };
};
