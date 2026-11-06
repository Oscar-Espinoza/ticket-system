// The project query shared by the dashboard layout (sidebar, topbar palette), the dashboard home and other
// pages (search, views, my issues, dashboards). The <ProjectList> markup is
// project-list.svelte, fed by the dashboard page load.
//
// Authorization: The INNER JOIN on project_member restricts rows to projects
// where the viewer has a membership row (owner OR member). No cross-tenant
// project can appear. userId always comes from the server-side session.

import { and, eq, isNull, sql } from 'drizzle-orm';

import { projects, projectMembers, tickets, workflowStates } from '@/db/schema';
import { db } from '@/lib/db';
import { cache } from '@/lib/kit/request';

/**
 * Returns every project the user owns or is a member of, with numeric open and
 * resolved ticket counts and ordered newest-first. "Resolved" means the
 * ticket's workflow state is completed or canceled; archived and trashed
 * tickets are excluded in the join so they count as neither.
 *
 * The INNER JOIN on project_member is the authorization filter — no project
 * without a membership row for this userId can appear in the result set.
 *
 * Memoized per request (layout + page loads share one query).
 */
export const getProjectsForUser = cache(async (userId: string) =>
  db
    .select({
      id: projects.id,
      name: projects.name,
      ticketKey: projects.ticketKey,
      parentId: projects.parentId,
      createdAt: projects.createdAt,
      role: projectMembers.role,
      // Cast to int — PostgreSQL count() returns bigint, which Drizzle
      // types as string without the explicit cast.
      openCount: sql<number>`cast(count(case when ${workflowStates.type} not in ('completed', 'canceled') then 1 end) as int)`,
      resolvedCount: sql<number>`cast(count(case when ${workflowStates.type} in ('completed', 'canceled') then 1 end) as int)`,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .leftJoin(
      tickets,
      and(
        eq(tickets.projectId, projects.id),
        isNull(tickets.archivedAt),
        isNull(tickets.deletedAt),
      ),
    )
    .leftJoin(workflowStates, eq(workflowStates.id, tickets.stateId))
    .where(eq(projectMembers.userId, userId))
    .groupBy(
      projects.id,
      projects.name,
      projects.ticketKey,
      projects.parentId,
      projects.createdAt,
      projectMembers.role,
    )
    .orderBy(sql`${projects.createdAt} desc`),
);

/** One row of getProjectsForUser (what <ProjectList projects> renders). */
export type UserProject = Awaited<ReturnType<typeof getProjectsForUser>>[number];
