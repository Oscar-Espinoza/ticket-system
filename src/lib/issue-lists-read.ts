// Issue list reads behind the trash, archive, cycle and member-profile pages
// (server only). Each is membership-gated in SQL through memberOfIssueProject.

import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';

import { tickets } from '@/db/schema';
import { activeIssue, memberOfIssueProject, queryIssues } from '@/lib/tickets';
import { openStateType } from '@/lib/workflow-server';

const LIST_LIMIT = 1000;

/** Trashed issues of a project, most recently deleted first. */
export function getTrashedIssues(projectId: string, userId: string) {
  return queryIssues(
    and(eq(tickets.projectId, projectId), isNotNull(tickets.deletedAt), memberOfIssueProject(userId)),
    { orderBy: [desc(tickets.deletedAt), desc(tickets.ticketNumber)], limit: LIST_LIMIT },
  );
}

/** Archived issues of a project (not in the trash), most recently archived first. */
export function getArchivedIssues(projectId: string, userId: string) {
  return queryIssues(
    and(
      eq(tickets.projectId, projectId),
      isNotNull(tickets.archivedAt),
      isNull(tickets.deletedAt),
      memberOfIssueProject(userId),
    ),
    { orderBy: [desc(tickets.archivedAt), desc(tickets.ticketNumber)], limit: LIST_LIMIT },
  );
}

/** Active issues of one cycle. */
export function getCycleIssues(projectId: string, cycleId: string, userId: string) {
  return queryIssues(
    and(
      eq(tickets.projectId, projectId),
      eq(tickets.cycleId, cycleId),
      activeIssue(),
      memberOfIssueProject(userId),
    ),
  );
}

/** Open issues assigned to `assigneeId`, in projects the viewer belongs to, newest update first. */
export function getAssignedOpenIssues(assigneeId: string, viewerId: string) {
  return queryIssues(
    and(
      eq(tickets.assigneeId, assigneeId),
      memberOfIssueProject(viewerId),
      activeIssue(),
      openStateType(),
    ),
    { limit: 50, orderBy: [desc(tickets.updatedAt)] },
  );
}
