// Project issue listing shared by REST (`GET /api/v1/projects/:id/issues`) and
// GraphQL (`issues(projectId, filter, first, after)`), so both filter and page
// identically. Does NOT authorize — callers check project read access first.
// Newest number first; cursor = the last issue number seen. Trashed issues
// never list.

import { and, desc, eq, exists, gte, isNull, lt, or, sql, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import { issueLabels, labels, tickets, workflowStates } from '@/db/schema';
import { isStateType, type IssueRow } from '@/lib/issue-model';
import { queryIssues } from '@/lib/tickets';

export const ISSUE_PAGE_DEFAULT = 50;
export const ISSUE_PAGE_MAX = 100;

export interface IssueListFilter {
  /** State id, name (case-insensitive) or type. */
  state?: string | null;
  /** User id, `me` or `none`. */
  assignee?: string | null;
  /** Label id or name (case-insensitive). */
  label?: string | null;
  /** ISO 8601 date-time. */
  updatedSince?: string | null;
  includeArchived?: boolean | null;
}

export type IssuePageResult =
  | { ok: true; issues: IssueRow[]; nextCursor: string | null }
  | { ok: false; error: string; field: string };

export async function listProjectIssues(
  viewerId: string,
  projectId: string,
  filter: IssueListFilter,
  page: { limit?: number | null; cursor?: string | null } = {},
): Promise<IssuePageResult> {
  const where: (SQL | undefined)[] = [eq(tickets.projectId, projectId), isNull(tickets.deletedAt)];
  if (!filter.includeArchived) where.push(isNull(tickets.archivedAt));

  const { state, assignee, label, updatedSince } = filter;
  if (state) {
    where.push(
      or(
        eq(tickets.stateId, state),
        sql`lower(${workflowStates.name}) = lower(${state})`,
        // The type column is an enum: only compare valid values.
        isStateType(state) ? eq(workflowStates.type, state) : undefined,
      ),
    );
  }

  if (assignee === 'none') where.push(isNull(tickets.assigneeId));
  else if (assignee) where.push(eq(tickets.assigneeId, assignee === 'me' ? viewerId : assignee));

  if (label) {
    where.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(issueLabels)
          .innerJoin(labels, eq(issueLabels.labelId, labels.id))
          .where(
            and(
              eq(issueLabels.ticketId, tickets.id),
              or(eq(labels.id, label), sql`lower(${labels.name}) = lower(${label})`),
            ),
          ),
      ),
    );
  }

  if (updatedSince) {
    const date = new Date(updatedSince);
    if (Number.isNaN(date.getTime())) {
      return { ok: false, error: 'updated_since must be an ISO 8601 date.', field: 'updated_since' };
    }
    where.push(gte(tickets.updatedAt, date));
  }

  if (page.cursor) {
    if (!/^\d{1,9}$/.test(page.cursor)) return { ok: false, error: 'Invalid cursor.', field: 'cursor' };
    where.push(lt(tickets.ticketNumber, Number(page.cursor)));
  }

  const limit = page.limit ?? ISSUE_PAGE_DEFAULT;
  if (!Number.isInteger(limit) || limit < 1 || limit > ISSUE_PAGE_MAX) {
    return { ok: false, error: `limit must be between 1 and ${ISSUE_PAGE_MAX}.`, field: 'limit' };
  }

  // One extra row tells us whether there is a next page.
  const rows = await queryIssues(and(...where), {
    orderBy: [desc(tickets.ticketNumber)],
    limit: limit + 1,
  });
  const issues = rows.slice(0, limit);
  return {
    ok: true,
    issues,
    nextCursor: rows.length > limit ? String(issues[issues.length - 1].number) : null,
  };
}
