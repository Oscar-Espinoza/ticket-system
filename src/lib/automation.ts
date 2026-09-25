// Lazy project automations (no cron on the free tier). The project layout calls
// runProjectAutomations inside `after()` on every project page load; an atomic
// UPDATE … RETURNING on project.automation_run_at lets exactly one request per
// project per day through. Steps are capped per run and isolated — leftovers
// are picked up the next day, and nothing here ever throws.
//
// Every write goes through the issue service with the system actor, so the
// activity log, notifications, Slack and webhooks see automations like edits.

import { and, asc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projects, tickets, workflowStates } from '@/db/schema';
import { ensureUpcomingCycles, completeEndedCycles } from '@/lib/cycles';
import { emitIssueEvent } from '@/lib/events';
import { SYSTEM_ACTOR, archive, bulkUpdate, purge, BULK_MAX } from '@/lib/issue-service';
import { declineState } from '@/lib/triage';

export { AUTOMATION_MONTHS } from '@/components/cycles/cycle-utils';
export const TRASH_RETENTION_DAYS = 30;
export const AUTO_CLOSED_EVENT = 'issue.auto_closed';

const ARCHIVE_LIMIT = 100;
const PURGE_LIMIT = 100;

type ProjectSettings = {
  autoArchiveMonths: number | null;
  autoCloseMonths: number | null;
  cyclesEnabled: boolean;
  cycleAutoCreate: boolean;
  cycleDurationWeeks: number;
  cycleStartWeekday: number;
  cycleAutoRollover: boolean;
};

/** Claim today's run: the row comes back only for the one request that wins. */
async function claimRun(projectId: string): Promise<ProjectSettings | null> {
  const [row] = await db
    .update(projects)
    .set({ automationRunAt: sql`now()` })
    .where(
      and(
        eq(projects.id, projectId),
        sql`(${projects.automationRunAt} is null or ${projects.automationRunAt} < now() - interval '1 day')`,
      ),
    )
    .returning({
      autoArchiveMonths: projects.autoArchiveMonths,
      autoCloseMonths: projects.autoCloseMonths,
      cyclesEnabled: projects.cyclesEnabled,
      cycleAutoCreate: projects.cycleAutoCreate,
      cycleDurationWeeks: projects.cycleDurationWeeks,
      cycleStartWeekday: projects.cycleStartWeekday,
      cycleAutoRollover: projects.cycleAutoRollover,
    });
  return row ?? null;
}

const monthsAgo = (months: number) => sql`now() - make_interval(months => ${months}::int)`;

async function autoArchive(projectId: string, months: number) {
  const rows = await db
    .select({ id: tickets.id })
    .from(tickets)
    .innerJoin(workflowStates, eq(tickets.stateId, workflowStates.id))
    .where(
      and(
        eq(tickets.projectId, projectId),
        isNull(tickets.archivedAt),
        isNull(tickets.deletedAt),
        inArray(workflowStates.type, ['completed', 'canceled']),
        sql`coalesce(${tickets.completedAt}, ${tickets.canceledAt}, ${tickets.updatedAt}) < ${monthsAgo(months)}`,
      ),
    )
    .orderBy(asc(tickets.updatedAt))
    .limit(ARCHIVE_LIMIT);
  // Sequential: each archive is one batch; this runs after the response anyway.
  for (const { id } of rows) {
    const result = await archive(SYSTEM_ACTOR, projectId, id);
    if (!result.ok) console.error('[automation] archive failed', id, result.error);
  }
}

async function autoClose(projectId: string, months: number) {
  const states = await db
    .select({
      id: workflowStates.id,
      name: workflowStates.name,
      type: workflowStates.type,
      color: workflowStates.color,
      position: workflowStates.position,
      description: workflowStates.description,
    })
    .from(workflowStates)
    .where(eq(workflowStates.projectId, projectId));
  const target = declineState(states);
  if (!target) return;

  const rows = await db
    .select({ id: tickets.id, number: tickets.ticketNumber, title: tickets.title, key: projects.ticketKey })
    .from(tickets)
    .innerJoin(workflowStates, eq(tickets.stateId, workflowStates.id))
    .innerJoin(projects, eq(tickets.projectId, projects.id))
    .where(
      and(
        eq(tickets.projectId, projectId),
        isNull(tickets.archivedAt),
        isNull(tickets.deletedAt),
        inArray(workflowStates.type, ['triage', 'backlog', 'unstarted']),
        lt(tickets.updatedAt, monthsAgo(months)),
      ),
    )
    .orderBy(asc(tickets.updatedAt))
    .limit(BULK_MAX);
  if (rows.length === 0) return;

  const result = await bulkUpdate(
    SYSTEM_ACTOR,
    projectId,
    rows.map((r) => r.id),
    { stateId: target.id },
  );
  if (!result.ok) {
    console.error('[automation] auto-close failed', result.error);
    return;
  }
  const summary = `auto-closed after ${months} month${months === 1 ? '' : 's'} of inactivity`;
  await emitIssueEvent(
    rows.map((row) => ({
      projectId,
      ticketId: row.id,
      actorId: null,
      type: AUTO_CLOSED_EVENT,
      data: { key: `${row.key}-${row.number}`, title: row.title, summary, months },
    })),
  );
}

async function purgeTrash(projectId: string) {
  const rows = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(
      and(
        eq(tickets.projectId, projectId),
        sql`${tickets.deletedAt} < now() - make_interval(days => ${TRASH_RETENTION_DAYS}::int)`,
      ),
    )
    .orderBy(asc(tickets.deletedAt))
    .limit(PURGE_LIMIT);
  for (const { id } of rows) {
    const result = await purge(SYSTEM_ACTOR, projectId, id);
    if (!result.ok) console.error('[automation] purge failed', id, result.error);
  }
}

async function cycleUpkeep(projectId: string, settings: ProjectSettings) {
  const now = new Date();
  // Create first, so ended cycles have a next cycle to roll issues into.
  if (settings.cycleAutoCreate) {
    await ensureUpcomingCycles(
      projectId,
      settings.cycleDurationWeeks,
      now,
      settings.cycleStartWeekday,
    );
  }
  await completeEndedCycles(SYSTEM_ACTOR, projectId, now, {
    rollover: settings.cycleAutoRollover,
  });
}

async function step(name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (err) {
    console.error(`[automation] ${name} failed`, err);
  }
}

export async function runProjectAutomations(projectId: string): Promise<void> {
  if (!projectId) return;
  let settings: ProjectSettings | null;
  try {
    settings = await claimRun(projectId);
  } catch (err) {
    console.error('[automation] claim failed', err);
    return;
  }
  if (!settings) return;
  const s = settings;

  if (s.autoArchiveMonths) await step('auto-archive', () => autoArchive(projectId, s.autoArchiveMonths!));
  if (s.autoCloseMonths) await step('auto-close', () => autoClose(projectId, s.autoCloseMonths!));
  await step('trash purge', () => purgeTrash(projectId));
  if (s.cyclesEnabled) await step('cycles', () => cycleUpkeep(projectId, s));
}
