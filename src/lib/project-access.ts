// Project membership authorization — the DAL seam for project-scoped reads
// and writes: requireProjectMember (throws), getMemberProject (null for
// outsiders) and projectMemberOf (SQL predicate) all answer "is this user a
// member of this project, and as what".
//
// Callers must check membership BEFORE any project-scoped read, and map
// ProjectAccessError appropriately:
//   - pages and detail routes: 404 (enumeration-resistant)
//   - server actions: return 'Forbidden'
//
// Server-only: imports `db`, which reads DATABASE_URL.

import { cache } from '@/lib/kit/request';
import { db } from '@/lib/db';
import type { ProjectRole } from '@/lib/roles';
import { projectMembers, projects } from '@/db/schema';
import { and, asc, eq, exists, sql, type SQL } from 'drizzle-orm';
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The membership row returned by requireProjectMember on success. */
export type ProjectMembership = {
  projectId: string;
  userId: string;
  role: ProjectRole;
};

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

/** Thrown by requireProjectMember when userId is not a member of projectId. */
export class ProjectAccessError extends Error {
  constructor(message = 'Not a project member') {
    super(message);
    this.name = 'ProjectAccessError';
  }
}

// ---------------------------------------------------------------------------
// DAL helper
// ---------------------------------------------------------------------------

/**
 * Verifies that `userId` is a member of `projectId` and returns the membership
 * with its role, so callers can check the role without a second query.
 *
 * @param projectId - the project to check membership for (untrusted input)
 * @throws ProjectAccessError if userId is not a member of projectId
 */
export async function requireProjectMember(
  projectId: string,
  userId: string,
): Promise<ProjectMembership> {
  // projectId is untrusted (URL/FormData): reject falsy ids explicitly rather
  // than relying on the query returning nothing.
  if (!projectId || !userId) {
    throw new ProjectAccessError();
  }

  const [membership] = await db
    .select({
      projectId: projectMembers.projectId,
      userId: projectMembers.userId,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!membership) {
    throw new ProjectAccessError();
  }

  return membership;
}

/**
 * Like requireProjectMember, but only for the project's owner.
 *
 * @throws ProjectAccessError if userId is not a member, or is a member but not owner
 */
export async function requireProjectOwner(
  projectId: string,
  userId: string,
): Promise<ProjectMembership> {
  const membership = await requireProjectMember(projectId, userId);
  if (membership.role !== 'owner') {
    throw new ProjectAccessError('Not the project owner');
  }
  return membership;
}

/**
 * The project as seen by one member, or null when `userId` is not a member.
 *
 * The inner join on project_member is the authorization filter (same pattern
 * as getProjectsForUser), so membership and project data arrive in a
 * single round trip. Memoized per request.
 */
export const getMemberProject = cache(
  async (projectId: string, userId: string) => {
    if (!projectId || !userId) return null;
    const [row] = await db
      .select({
        id: projects.id,
        name: projects.name,
        ticketKey: projects.ticketKey,
        role: projectMembers.role,
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projectMembers.projectId, projects.id))
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId),
        ),
      )
      .limit(1);
    return row ?? null;
  },
);

/**
 * Projects both users belong to, with `userId`'s role in each (empty when they
 * share none). The viewer's membership join is the authorization filter:
 * callers use a non-empty result as "these two people work together" (member
 * profiles, adding people you know to a workspace). Memoized per request.
 */
export const getSharedProjects = cache(async (viewerId: string, userId: string) => {
  if (!viewerId || !userId) return [];
  const viewer = alias(projectMembers, 'viewer_member');
  return db
    .select({
      id: projects.id,
      name: projects.name,
      ticketKey: projects.ticketKey,
      role: projectMembers.role,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .innerJoin(
      viewer,
      and(eq(viewer.projectId, projectMembers.projectId), eq(viewer.userId, viewerId)),
    )
    .where(eq(projectMembers.userId, userId))
    .orderBy(asc(projects.name));
});

/**
 * SQL condition: `userId` is a member of the project in `projectColumn`. The
 * tenant filter for every project-scoped read that lists rows (correlated
 * EXISTS, so it composes into any WHERE).
 */
export function projectMemberOf(projectColumn: AnyPgColumn | SQL, userId: string): SQL {
  const viewer = alias(projectMembers, 'member_viewer');
  return exists(
    db
      .select({ one: sql`1` })
      .from(viewer)
      .where(and(eq(viewer.projectId, projectColumn), eq(viewer.userId, userId))),
  );
}
