'use server';

// SLA policy (admin) and the time-in-status history (read). The policy only
// applies to new issues and priority changes (issue service) until an admin
// applies it to open issues here.

import { revalidatePath } from 'next/cache';
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

type Fail = { ok: false; error: string };

/** State changes read per issue (newest kept). */
const HISTORY_LIMIT = 500;

function revalidateProject(projectId: string) {
  revalidatePath(`/dashboard/projects/${projectId}`, 'layout');
}

export async function updateSlaPolicy(input: {
  projectId: string;
  policy: SlaPolicy;
}): Promise<{ ok: true; policy: SlaPolicy } | Fail> {
  const authz = await authorizeProjectAction(input?.projectId, 'admin');
  if (!authz.ok) return authz;
  const policy = normalizeSlaPolicy(input.policy);
  if (!policy) return { ok: false, error: 'SLA targets must be whole hours between 1 and 8760.' };

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
  revalidateProject(input.projectId);
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
}): Promise<{ ok: true; updated: number } | Fail> {
  const authz = await authorizeProjectAction(input?.projectId, 'admin');
  if (!authz.ok) return authz;
  const { projectId } = input;

  const [project] = await db
    .select({ slaPolicy: projects.slaPolicy })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return { ok: false, error: 'Project not found.' };
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
            notInArray(workflowStates.type, ['completed', 'canceled']),
          ),
        ),
    ),
  );

  const withTarget = PRIORITY_ORDER.filter(
    (p): p is keyof SlaPolicy => p in policy,
  );
  const statements = withTarget.map((priority) => {
    const due: SQL = sql`${tickets.createdAt} + make_interval(hours => ${policy[priority]}::int)`;
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
  revalidateProject(projectId);
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
}): Promise<{ ok: true; states: TimeInState[] } | Fail> {
  const authz = await authorizeProjectAction(input?.projectId, 'read');
  if (!authz.ok) return authz;
  if (typeof input.issueId !== 'string' || !input.issueId) {
    return { ok: false, error: 'Issue not found.' };
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
  if (!issue) return { ok: false, error: 'Issue not found.' };

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
