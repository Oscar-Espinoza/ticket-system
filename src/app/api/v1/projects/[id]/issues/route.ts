import { and, desc, eq, exists, gte, isNull, lt, or, sql, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import { issueLabels, labels, tickets, workflowStates } from '@/db/schema';
import { apiError, readJsonBody } from '@/lib/api-auth';
import { createIssue, type CreateIssueInput } from '@/lib/issue-service';
import { isStateType } from '@/lib/issue-model';
import { queryIssues } from '@/lib/tickets';
import { apiRoute, projectAccess, serializeIssue, serviceError } from '../../../_lib/api';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * GET /projects/:id/issues — newest number first, cursor = last number seen.
 * Filters: state (id | name | type), assignee (id | me | none), label (id | name),
 * updated_since (ISO date), include_archived (true). Trashed issues never list.
 */
export const GET = apiRoute<{ id: string }>(async (req, { userId }, { id }) => {
  const access = await projectAccess(userId, id, 'read');
  if (!access.ok) return access.response;

  const params = new URL(req.url).searchParams;
  const where: (SQL | undefined)[] = [eq(tickets.projectId, id), isNull(tickets.deletedAt)];
  if (params.get('include_archived') !== 'true') where.push(isNull(tickets.archivedAt));

  const state = params.get('state');
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

  const assignee = params.get('assignee');
  if (assignee === 'none') where.push(isNull(tickets.assigneeId));
  else if (assignee) where.push(eq(tickets.assigneeId, assignee === 'me' ? userId : assignee));

  const label = params.get('label');
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

  const updatedSince = params.get('updated_since');
  if (updatedSince) {
    const date = new Date(updatedSince);
    if (Number.isNaN(date.getTime())) {
      return apiError(400, 'updated_since must be an ISO 8601 date.', { field: 'updated_since' });
    }
    where.push(gte(tickets.updatedAt, date));
  }

  const cursor = params.get('cursor');
  if (cursor) {
    if (!/^\d{1,9}$/.test(cursor)) return apiError(400, 'Invalid cursor.', { field: 'cursor' });
    where.push(lt(tickets.ticketNumber, Number(cursor)));
  }

  const limitParam = params.get('limit');
  const limit = limitParam ? Number(limitParam) : DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return apiError(400, `limit must be between 1 and ${MAX_LIMIT}.`, { field: 'limit' });
  }

  // One extra row tells us whether there is a next page.
  const rows = await queryIssues(and(...where), {
    orderBy: [desc(tickets.ticketNumber)],
    limit: limit + 1,
  });
  const page = rows.slice(0, limit);
  return Response.json({
    issues: page.map(serializeIssue),
    nextCursor: rows.length > limit ? String(page[page.length - 1].number) : null,
  });
});

/** POST /projects/:id/issues — body: CreateIssueInput (title required). */
export const POST = apiRoute<{ id: string }>(async (req, { userId }, { id }) => {
  const access = await projectAccess(userId, id, 'write');
  if (!access.ok) return access.response;
  const json = await readJsonBody(req);
  if (!json.ok) return json.response;

  // createIssue validates every field and referenced id against this project.
  const result = await createIssue({ userId }, id, json.body as unknown as CreateIssueInput);
  if (!result.ok) return serviceError(result);
  return Response.json({ issue: serializeIssue(result.issue) }, { status: 201 });
});
