// Workspace page: its
// projects ("teams") and members. Members only — anyone else gets a 404, so
// slugs can't be probed. Project names and keys are visible to every workspace
// member; issue counts only for projects the viewer belongs to.

import { error } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import {
  projectMembers,
  projects,
  tickets,
  users,
  workflowStates,
  workspaceInvitations,
  workspaceMembers,
  workspaces,
} from '@/db/schema';
import { db } from '@/lib/db';
import { rolesAllowing } from '@/lib/roles';
import { requireUser } from '@/lib/session';
import { getWorkspaceMembership, workspaceInviteUrl } from '@/lib/workspace-access';
import { workspaceRoleAllows } from '@/lib/workspace-types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const { id: userId } = await requireUser();

  const membership = await getWorkspaceMembership(params.slug, userId);
  if (!membership) error(404, 'Workspace not found');
  const workspaceId = membership.workspaceId;

  const viewer = alias(projectMembers, 'viewer_member');
  const otherWorkspace = alias(workspaces, 'other_workspace');
  const isAdmin = workspaceRoleAllows(membership.role, 'admin');

  const [projectRows, openRows, memberRows, eligibleRows, invitationRows] = await db.batch([
    db
      .select({
        id: projects.id,
        name: projects.name,
        ticketKey: projects.ticketKey,
        viewerRole: viewer.role,
        memberCount: sql<number>`(select cast(count(*) as int) from ${projectMembers} where ${projectMembers.projectId} = ${projects.id})`,
        parentId: projects.parentId,
        visibility: projects.visibility,
      })
      .from(projects)
      .leftJoin(viewer, and(eq(viewer.projectId, projects.id), eq(viewer.userId, userId)))
      // Private teams the viewer isn't in never reach the browser.
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          or(isNotNull(viewer.id), eq(projects.visibility, 'workspace')),
        ),
      )
      .orderBy(asc(projects.name)),
    // Open issues, only in projects the viewer is a member of (the join gates it).
    db
      .select({
        projectId: tickets.projectId,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(tickets)
      .innerJoin(projects, eq(tickets.projectId, projects.id))
      .innerJoin(viewer, and(eq(viewer.projectId, projects.id), eq(viewer.userId, userId)))
      .innerJoin(workflowStates, eq(tickets.stateId, workflowStates.id))
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          isNull(tickets.archivedAt),
          isNull(tickets.deletedAt),
          sql`${workflowStates.type} not in ('completed', 'canceled')`,
        ),
      )
      .groupBy(tickets.projectId),
    db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, workspaceId)),
    // Projects the viewer administers that aren't here yet.
    db
      .select({
        id: projects.id,
        name: projects.name,
        ticketKey: projects.ticketKey,
        currentWorkspace: otherWorkspace.name,
      })
      .from(viewer)
      .innerJoin(projects, eq(viewer.projectId, projects.id))
      .leftJoin(otherWorkspace, eq(projects.workspaceId, otherWorkspace.id))
      .where(
        and(
          eq(viewer.userId, userId),
          inArray(viewer.role, rolesAllowing('admin')),
          or(isNull(projects.workspaceId), ne(projects.workspaceId, workspaceId)),
        ),
      )
      .orderBy(asc(projects.name)),
    // Pending invitations (expired ones included, so they can be renewed) —
    // tokens are credentials, so only admins get rows back.
    db
      .select({
        id: workspaceInvitations.id,
        email: workspaceInvitations.email,
        role: workspaceInvitations.role,
        token: workspaceInvitations.token,
        expiresAt: workspaceInvitations.expiresAt,
        invitedByName: users.name,
      })
      .from(workspaceInvitations)
      .leftJoin(users, eq(workspaceInvitations.invitedById, users.id))
      .where(
        and(
          eq(workspaceInvitations.workspaceId, workspaceId),
          isNull(workspaceInvitations.acceptedAt),
          isAdmin ? undefined : sql`false`,
        ),
      )
      .orderBy(desc(workspaceInvitations.createdAt)),
  ]);

  const openByProject = new Map(openRows.map((row) => [row.projectId, row.count]));
  const projectList = projectRows.map((project) => ({
    ...project,
    openCount: project.viewerRole ? (openByProject.get(project.id) ?? 0) : null,
  }));
  const invitations = invitationRows.map(({ token, expiresAt, ...row }) => ({
    ...row,
    expiresAt: expiresAt.toISOString(),
    url: workspaceInviteUrl(token),
  }));

  return {
    viewerId: userId,
    membership: {
      workspaceId,
      name: membership.name,
      slug: membership.slug,
      role: membership.role,
    },
    projects: projectList,
    eligible: isAdmin ? eligibleRows : [],
    members: memberRows,
    invitations,
  };
};
