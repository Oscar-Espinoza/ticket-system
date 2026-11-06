// Project templates — templates the viewer can use (own + shared with their
// workspaces), plus the projects they administer (sources for a new template)
// and their workspaces (sharing targets).

import { readProjectTemplates } from '@/lib/project-templates';
import { getAdminProjects } from '@/lib/project-settings-read';
import { requireUser } from '@/lib/session';
import { getUserWorkspaces } from '@/lib/workspace-access';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const { id: userId } = await requireUser();

  const [templates, adminProjects, workspaces] = await Promise.all([
    readProjectTemplates(userId),
    getAdminProjects(userId),
    getUserWorkspaces(userId),
  ]);

  return {
    templates,
    projects: adminProjects,
    workspaces: workspaces.map((w) => ({ id: w.id, name: w.name })),
  };
};
