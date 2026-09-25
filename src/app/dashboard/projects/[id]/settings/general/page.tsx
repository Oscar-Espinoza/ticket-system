import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { getSession } from '@/lib/session';
import { getMemberProject } from '@/lib/project-access';
import { db } from '@/lib/db';
import { projectMembers, projects, workspaces } from '@/db/schema';
import { roleAllows } from '@/lib/roles';
import { getUserWorkspaces } from '@/lib/workspace-access';
import { ProjectGeneralForm } from '@/components/settings/project-general-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  const project = session?.user ? await getMemberProject(id, session.user.id) : null;
  return { title: project ? `Settings · ${project.name}` : 'Project not found' };
}

/** Ids of `rootId` and every project below it (sub-teams can't become parents). */
function subtree(rootId: string, rows: { id: string; parentId: string | null }[]): Set<string> {
  const ids = new Set([rootId]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const row of rows) {
      if (row.parentId && ids.has(row.parentId) && !ids.has(row.id)) {
        ids.add(row.id);
        grew = true;
      }
    }
  }
  return ids;
}

export default async function ProjectGeneralSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');
  const userId = session.user.id;

  // Membership first (D-13), then the project's editable columns.
  const membership = await getMemberProject(id, userId);
  if (!membership) notFound();
  const [[project], userWorkspaces] = await Promise.all([
    db
      .select({
        name: projects.name,
        ticketKey: projects.ticketKey,
        description: projects.description,
        estimateScale: projects.estimateScale,
        workspaceId: projects.workspaceId,
        workspaceName: workspaces.name,
        parentId: projects.parentId,
        visibility: projects.visibility,
      })
      .from(projects)
      .leftJoin(workspaces, eq(projects.workspaceId, workspaces.id))
      .where(eq(projects.id, id))
      .limit(1),
    getUserWorkspaces(userId),
  ]);
  if (!project) notFound();

  // Candidate parents: same workspace, viewer is a member, not in our subtree.
  // Names of teams the viewer isn't in stay hidden, except the current parent.
  const viewer = alias(projectMembers, 'viewer');
  const siblings = project.workspaceId
    ? await db
        .select({
          id: projects.id,
          name: projects.name,
          ticketKey: projects.ticketKey,
          parentId: projects.parentId,
          member: viewer.id,
        })
        .from(projects)
        .leftJoin(viewer, and(eq(viewer.projectId, projects.id), eq(viewer.userId, userId)))
        .where(eq(projects.workspaceId, project.workspaceId))
        .orderBy(asc(projects.name))
    : [];
  const excluded = subtree(id, siblings);
  const parentOptions = siblings
    .filter((p) => !excluded.has(p.id) && (p.member !== null || p.id === project.parentId))
    .map(({ id: optionId, name, ticketKey }) => ({ id: optionId, name, ticketKey }));

  return (
    <>
      <h1 className="text-xl font-medium">General</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        Name, issue key and defaults for this project.
      </p>
      <ProjectGeneralForm
        projectId={id}
        name={project.name}
        ticketKey={project.ticketKey}
        description={project.description ?? ''}
        estimateScale={project.estimateScale}
        canEdit={roleAllows(membership.role, 'admin')}
        isOwner={membership.role === 'owner'}
        workspaceId={project.workspaceId}
        workspaceName={project.workspaceName}
        parentId={parentOptions.some((p) => p.id === project.parentId) ? project.parentId : null}
        parentOptions={parentOptions}
        visibility={project.visibility === 'workspace' ? 'workspace' : 'private'}
        templateWorkspaces={userWorkspaces.map((w) => ({ id: w.id, name: w.name }))}
      />
    </>
  );
}
