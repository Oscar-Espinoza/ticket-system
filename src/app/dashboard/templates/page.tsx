// Project templates — owned by D4a. Templates the viewer can use (own + shared
// with their workspaces), plus the projects they administer (sources for a
// new template) and their workspaces (sharing targets).

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { and, asc, eq, inArray } from 'drizzle-orm';

import { listProjectTemplates } from '@/app/actions/project-templates';
import { TemplatesManager } from '@/components/project-templates/templates-manager';
import { projectMembers, projects } from '@/db/schema';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { getUserWorkspaces } from '@/lib/workspace-access';

export const metadata: Metadata = { title: 'Project templates' };

export default async function ProjectTemplatesPage() {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  const userId = session.user.id;

  const [templates, adminProjects, workspaces] = await Promise.all([
    listProjectTemplates(),
    db
      .select({ id: projects.id, name: projects.name, ticketKey: projects.ticketKey })
      .from(projectMembers)
      .innerJoin(projects, eq(projectMembers.projectId, projects.id))
      .where(and(eq(projectMembers.userId, userId), inArray(projectMembers.role, ['owner', 'admin'])))
      .orderBy(asc(projects.name)),
    getUserWorkspaces(userId),
  ]);

  return (
    <TemplatesManager
      templates={templates.ok ? templates.templates : []}
      projects={adminProjects}
      workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))}
    />
  );
}
