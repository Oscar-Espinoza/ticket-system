// SLA policy (admin) and the time-in-status history (read). The policy only
// applies to new issues and priority changes (issue service) until an admin
// applies it to open issues here.

import { and, eq, inArray, isNull, notInArray, sql, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projects, tickets, workflowStates } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { emitIssueEvent } from '@/lib/events';
import { PRIORITY_ORDER } from '@/lib/issue-model';
import { normalizeSlaPolicy, type SlaPolicy, type TimeInState } from '@/lib/sla';
import { readTimeInStatus } from '@/lib/time-in-status';
import { slaDeadlineSql } from '@/lib/sla-server';
import { openStateType } from '@/lib/workflow-server';
import { fail, refreshesData, type ActionResult } from '@/lib/server/action-kit';

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

/** Time spent in each workflow state, from the issue's activity history. */
export async function getTimeInStatus(input: {
  projectId: string;
  issueId: string;
}): Promise<ActionResult<{ states: TimeInState[] }>> {
  const authz = await authorizeProjectAction(input?.projectId, 'read');
  if (!authz.ok) return authz;
  return readTimeInStatus(input.projectId, input.issueId);
}
