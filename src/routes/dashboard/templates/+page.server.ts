// Project templates — templates the viewer can use (own + shared with their
// workspaces), plus the projects they administer (sources for a new template)
// and their workspaces (sharing targets).

import { and, asc, eq, inArray } from 'drizzle-orm';

import { listProjectTemplates } from '@/lib/server/actions/project-templates';
import { projectMembers, projects } from '@/db/schema';
import { db } from '@/lib/db';
import { rolesAllowing } from '@/lib/roles';
import { requireUser } from '@/lib/session';
import { getUserWorkspaces } from '@/lib/workspace-access';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const { id: userId } = await requireUser();

  const [templates, adminProjects, workspaces] = await Promise.all([
    listProjectTemplates(),
    db
      .select({ id: projects.id, name: projects.name, ticketKey: projects.ticketKey })
      .from(projectMembers)
      .innerJoin(projects, eq(projectMembers.projectId, projects.id))
      .where(and(eq(projectMembers.userId, userId), inArray(projectMembers.role, rolesAllowing('admin'))))
      .orderBy(asc(projects.name)),
    getUserWorkspaces(userId),
  ]);

  return {
    templates: templates.ok ? templates.templates : [],
    projects: adminProjects,
    workspaces: workspaces.map((w) => ({ id: w.id, name: w.name })),
  };
};
