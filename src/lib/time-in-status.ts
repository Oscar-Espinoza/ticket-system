// Time spent in each workflow state, rebuilt from an issue's activity history.
// No authorization here: callers check read access to the project first.
// Server-only.

import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { activities, tickets, workflowStates } from '@/db/schema';
import { isStateType } from '@/lib/issue-model';
import { fail, type ActionResult } from '@/lib/server/action-kit';
import { timeInStatus, type StateChange, type StateRef, type TimeInState } from '@/lib/sla';

/** State changes read per issue (newest kept). */
const HISTORY_LIMIT = 500;

function stateRef(value: unknown): StateRef | null {
  if (!value || typeof value !== 'object') return null;
  const { id, name, type } = value as Record<string, unknown>;
  return typeof id === 'string' && typeof name === 'string' && isStateType(type)
    ? { id, name, type }
    : null;
}

/** Time spent in each workflow state of an issue (untrusted `issueId`). */
export async function readTimeInStatus(
  projectId: string,
  issueId: unknown,
): Promise<ActionResult<{ states: TimeInState[] }>> {
  if (typeof issueId !== 'string' || !issueId) return fail('Issue not found.');

  const [issueRows, changeRows] = await db.batch([
    db
      .select({
        createdAt: tickets.createdAt,
        stateId: workflowStates.id,
        stateName: workflowStates.name,
        stateType: workflowStates.type,
      })
      .from(tickets)
      .innerJoin(workflowStates, eq(tickets.stateId, workflowStates.id))
      .where(and(eq(tickets.projectId, projectId), eq(tickets.id, issueId)))
      .limit(1),
    db
      .select({ data: activities.data, at: activities.createdAt })
      .from(activities)
      .where(
        and(
          eq(activities.projectId, projectId),
          eq(activities.ticketId, issueId),
          eq(activities.type, 'issue.updated'),
          sql`${activities.data} @> ${JSON.stringify({ changes: [{ field: 'stateId' }] })}::jsonb`,
        ),
      )
      .orderBy(desc(activities.createdAt))
      .limit(HISTORY_LIMIT),
  ]);
  const [issue] = issueRows;
  if (!issue) return fail('Issue not found.');

  const changes: StateChange[] = [];
  for (const row of changeRows.reverse()) {
    const list = Array.isArray(row.data.changes) ? row.data.changes : [];
    const change = list.find(
      (c): c is { field: string; from: unknown; to: unknown } =>
        !!c && typeof c === 'object' && (c as { field?: unknown }).field === 'stateId',
    );
    if (change) changes.push({ at: row.at, from: stateRef(change.from), to: stateRef(change.to) });
  }
  const current = { id: issue.stateId, name: issue.stateName, type: issue.stateType };
  return { ok: true, states: timeInStatus(issue.createdAt, changes, current) };
}
