// The reads behind the workspace page, in one transaction (server only). NO
// AUTHORIZATION here: the caller has checked workspace membership.

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
import { openStateType } from '@/lib/workflow-server';

/**
 * Projects visible to the viewer (private teams they aren't in never leave the
 * server), open-issue counts for the projects they belong to, the member
 * roster, projects they administer that aren't in the workspace yet, and
 * pending invitations. Invitation rows hold credentials (tokens), so they come
 * back only when `isAdmin`.
 */
export function getWorkspacePage(workspaceId: string, userId: string, isAdmin: boolean) {
  const viewer = alias(projectMembers, 'viewer_member');
  const otherWorkspace = alias(workspaces, 'other_workspace');

  return db.batch([
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
          openStateType(),
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
    // Expired invitations are included so they can be renewed.
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
}
