// SLA policy (admin) and the time-in-status history (read). The policy only
// applies to new issues and priority changes (issue service) until an admin
// applies it to open issues here.

import { and, desc, eq, inArray, isNull, notInArray, sql, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import { activities, projects, tickets, workflowStates } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { emitIssueEvent } from '@/lib/events';
import { isStateType, PRIORITY_ORDER } from '@/lib/issue-model';
import {
  normalizeSlaPolicy,
  timeInStatus,
  type SlaPolicy,
  type StateChange,
  type StateRef,
  type TimeInState,
} from '@/lib/sla';
import { slaDeadlineSql } from '@/lib/sla-server';
import { openStateType } from '@/lib/workflow-server';
import { fail, refreshesData, type ActionResult } from '@/lib/server/action-kit';

/** State changes read per issue (newest kept). */
const HISTORY_LIMIT = 500;

export async function updateSlaPolicy(input: {
  projectId: string;
  policy: SlaPolicy;
}): Promise<ActionResult<{ policy: SlaPolicy }>> {
  const authz = await authorizeProjectAction(input?.projectId, 'admin');
  if (!authz.ok) return authz;
  const policy = normalizeSlaPolicy(input.policy);
  if (!policy) return fail('SLA targets must be whole hours between 1 and 8760.');

  await db
    .update(projects)
    .set({ slaPolicy: policy, updatedAt: new Date() })
    .where(eq(projects.id, input.projectId));
  await emitIssueEvent({
    projectId: input.projectId,
    ticketId: null,
    actorId: authz.userId,
    type: 'project.sla_policy_updated',
    data: { summary: 'updated the SLA policy', policy },
  });
  refreshesData();
  return { ok: true, policy };
}

/**
 * Recompute every open, active issue's deadline from its creation time under
 * the saved policy. Issues already past the new deadline are marked breached
 * without notifying (the daily job only notifies fresh breaches), so applying a
 * policy never floods inboxes.
 */
export async function applySlaPolicyToOpenIssues(input: {
  projectId: string;
}): Promise<ActionResult<{ updated: number }>> {
  const authz = await authorizeProjectAction(input?.projectId, 'admin');
  if (!authz.ok) return authz;
  const { projectId } = input;

  const [project] = await db
    .select({ slaPolicy: projects.slaPolicy })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return fail('Project not found.');
  const policy = normalizeSlaPolicy(project.slaPolicy) ?? {};

  const open = and(
    eq(tickets.projectId, projectId),
    isNull(tickets.archivedAt),
    isNull(tickets.deletedAt),
    inArray(
      tickets.stateId,
      db
        .select({ id: workflowStates.id })
        .from(workflowStates)
        .where(
          and(
            eq(workflowStates.projectId, projectId),
            openStateType(),
          ),
        ),
    ),
  );

  const withTarget = PRIORITY_ORDER.filter(
    (p): p is keyof SlaPolicy => p in policy,
  );
  const statements = withTarget.map((priority) => {
    const due: SQL = slaDeadlineSql(tickets.createdAt, policy[priority]!);
    return db
      .update(tickets)
      .set({
        slaDueAt: sql`${due}`,
        slaBreachedAt: sql`case when ${due} <= now() then coalesce(${tickets.slaBreachedAt}, now()) else null end`,
      })
      .where(and(open, eq(tickets.priority, priority)))
      .returning({ id: tickets.id });
  });
  statements.push(
    db
      .update(tickets)
      .set({ slaDueAt: null, slaBreachedAt: null })
      .where(
        and(
          open,
          withTarget.length ? notInArray(tickets.priority, withTarget) : undefined,
          sql`(${tickets.slaDueAt} is not null or ${tickets.slaBreachedAt} is not null)`,
        ),
      )
      .returning({ id: tickets.id }),
  );
  const [first, ...rest] = statements;
  const results = await db.batch([first, ...rest]);
  const updated = results.reduce((sum, rows) => sum + rows.length, 0);

  await emitIssueEvent({
    projectId,
    ticketId: null,
    actorId: authz.userId,
    type: 'project.sla_policy_applied',
    data: {
      summary: `applied the SLA policy to ${updated} open ${updated === 1 ? 'issue' : 'issues'}`,
      count: updated,
    },
  });
  refreshesData();
  return { ok: true, updated };
}

function stateRef(value: unknown): StateRef | null {
  if (!value || typeof value !== 'object') return null;
  const { id, name, type } = value as Record<string, unknown>;
  return typeof id === 'string' && typeof name === 'string' && isStateType(type)
    ? { id, name, type }
    : null;
}

/** Time spent in each workflow state, from the issue's activity history. */
export async function getTimeInStatus(input: {
  projectId: string;
  issueId: string;
}): Promise<ActionResult<{ states: TimeInState[] }>> {
  const authz = await authorizeProjectAction(input?.projectId, 'read');
  if (!authz.ok) return authz;
  if (typeof input.issueId !== 'string' || !input.issueId) {
    return fail('Issue not found.');
  }
  const { projectId, issueId } = input;

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
