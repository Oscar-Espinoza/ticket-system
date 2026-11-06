// The SLA deadline rule in one place: policy hours after the clock starts. The
// TS form stamps single issues (issue service); the SQL forms recompute or
// compare it in bulk (policy changes, search, the breach cron). Server-only.

import { and, eq, inArray, isNotNull, isNull, lte, notInArray, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db';
import { projects, tickets, workflowStates } from '@/db/schema';
import { PRIORITY_ORDER } from '@/lib/issue-model';
import { normalizeSlaPolicy, type SlaPolicy } from '@/lib/sla';
import { HOUR_MS } from '@/lib/time';
import { openStateType } from '@/lib/workflow-server';

/** Deadline from a project's SLA policy ({ priority: hours }); null when none applies. */
export function slaDeadline(
  policy: Record<string, number> | null | undefined,
  priority: string,
  from: Date,
): Date | null {
  const hours = policy?.[priority];
  return typeof hours === 'number' && hours > 0 ? new Date(from.getTime() + hours * HOUR_MS) : null;
}

/** `slaDeadline` as SQL: `from` (a timestamp column or expression) plus `hours`. */
export function slaDeadlineSql(from: AnyPgColumn | SQL, hours: number): SQL {
  return sql`${from} + make_interval(hours => ${hours}::int)`;
}

/** The ticket's SLA deadline has passed at `now` (callers add the open-state scope). */
export function slaPastDue(now: Date): SQL {
  return and(isNotNull(tickets.slaDueAt), lte(tickets.slaDueAt, now))!;
}

/**
 * Recompute every open, active issue's deadline from its creation time under
 * the project's saved policy. Issues already past the new deadline are marked
 * breached without notifying (the daily job only notifies fresh breaches), so
 * applying a policy never floods inboxes. Returns how many issues changed;
 * null when the project doesn't exist.
 */
export async function applyPolicyToOpenIssues(projectId: string): Promise<number | null> {
  const [project] = await db
    .select({ slaPolicy: projects.slaPolicy })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return null;
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
  return results.reduce((sum, rows) => sum + rows.length, 0);
}
