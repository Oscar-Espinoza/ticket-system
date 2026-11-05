import { error, redirect } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { projectMembers, projects, workspaces } from '@/db/schema';
import { db } from '@/lib/db';
import { getMemberProject } from '@/lib/project-access';
import { roleAllows } from '@/lib/roles';
import { getUserWorkspaces } from '@/lib/workspace-access';
import type { PageServerLoad } from './$types';

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

export const load: PageServerLoad = async ({ params, locals }) => {
  const { id } = params;
  if (!locals.user) redirect(303, '/login');
  const userId = locals.user.id;

  // Membership first (D-13), then the project's editable columns.
  const membership = await getMemberProject(id, userId);
  if (!membership) error(404, 'Not found');
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
  if (!project) error(404, 'Not found');

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

  return {
    projectId: id,
    projectName: membership.name,
    name: project.name,
    ticketKey: project.ticketKey,
    description: project.description ?? '',
    estimateScale: project.estimateScale,
    canEdit: roleAllows(membership.role, 'admin'),
    isOwner: membership.role === 'owner',
    workspaceId: project.workspaceId,
    workspaceName: project.workspaceName,
    parentId: parentOptions.some((p) => p.id === project.parentId) ? project.parentId : null,
    parentOptions,
    visibility: (project.visibility === 'workspace' ? 'workspace' : 'private') as
      | 'workspace'
      | 'private',
    templateWorkspaces: userWorkspaces.map((w) => ({ id: w.id, name: w.name })),
  };
};
