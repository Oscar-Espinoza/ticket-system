import { error, redirect } from '@sveltejs/kit';

import { listTemplates } from '@/lib/server/actions/templates';
import { getMemberProject } from '@/lib/project-access';
import { roleAllows } from '@/lib/roles';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const { id } = params;
  if (!locals.user) redirect(303, '/login');
  const membership = await getMemberProject(id, locals.user.id);
  if (!membership) error(404, 'Not found');

  const result = await listTemplates(id);
  if (!result.ok) error(404, 'Not found');

  return {
    projectId: id,
    templates: result.templates,
    canEdit: roleAllows(membership.role, 'write'),
  };
};
