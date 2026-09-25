// Recurring issues (server only). NO AUTHORIZATION here — callers (actions,
// the settings page under the membership-checked project layout, the daily
// cron) authorize first. Every query is scoped by id AND projectId where the
// caller supplied them.
//
// Runs are idempotent: a due schedule is claimed by moving `next_run_at`
// forward with a conditional update (`where next_run_at = <what we read>`)
// BEFORE the issue is created, so overlapping or retried runs create at most
// one issue per occurrence. Missed occurrences collapse into one issue.

import { and, asc, eq, inArray, lte, ne } from 'drizzle-orm';

import { db } from '@/lib/db';
import { notifications, projectMembers, recurringIssues, userProfiles } from '@/db/schema';
import { createIssue, SYSTEM_ACTOR, type IssueActor, type IssueResult } from '@/lib/issue-service';
import type { CreateIssueInput } from '@/lib/issue-model';
import { deliverToChannels } from '@/lib/notifications/channels';
import { prefEnabled } from '@/lib/notifications/types';
import { sanitizeIssueDefaults, TEMPLATE_FIELDS } from '@/components/productivity/issue-defaults';
import { DAY_MS, toDateInput, utcDay } from '@/components/cycles/cycle-utils';
import {
  DUE_IN_DAYS_MAX,
  nextOccurrence,
  normalizeSchedule,
  type RecurringDefaults,
  type RecurringIssue,
  type RecurringSchedule,
} from '@/components/recurring/schedule';

export type RecurringRow = typeof recurringIssues.$inferSelect;

/** Schedules handled per run (the next run continues). */
const RUN_LIMIT = 200;

export function getProjectRecurringIssues(projectId: string): Promise<RecurringRow[]> {
  return db
    .select()
    .from(recurringIssues)
    .where(eq(recurringIssues.projectId, projectId))
    .orderBy(asc(recurringIssues.createdAt));
}

/** Row → the client-safe shape the settings page renders. */
export function toRecurringIssue(row: RecurringRow): RecurringIssue {
  const parsed = normalizeSchedule(row.schedule);
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    data: row.data as RecurringDefaults,
    // Unparseable rows are paused by the runner; `broken` lets the UI say so.
    schedule: parsed.ok ? parsed.schedule : { freq: 'daily', interval: 1, start: toDateInput(row.createdAt) },
    broken: !parsed.ok,
    nextRunAt: row.nextRunAt,
    lastRunAt: row.lastRunAt,
    enabled: row.enabled,
  };
}

export function dueInDaysOf(data: Record<string, unknown>): number | null {
  const n = data.dueInDays;
  return Number.isInteger(n) && (n as number) >= 0 && (n as number) <= DUE_IN_DAYS_MAX
    ? (n as number)
    : null;
}

/**
 * First run on or after max(start, today, the day after the last run) — so
 * editing or resuming a schedule never repeats today's issue.
 */
export function firstRunFrom(
  schedule: RecurringSchedule,
  now: Date,
  lastRunAt: Date | null,
): Date | null {
  let from = utcDay(now).getTime();
  if (lastRunAt) from = Math.max(from, utcDay(lastRunAt).getTime() + DAY_MS);
  return nextOccurrence(schedule, from);
}

/** The schedule's creator while they can still write in the project, else the system. */
async function actorFor(row: RecurringRow): Promise<IssueActor> {
  if (!row.createdById) return SYSTEM_ACTOR;
  const [member] = await db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, row.projectId),
        eq(projectMembers.userId, row.createdById),
        ne(projectMembers.role, 'guest'),
      ),
    )
    .limit(1);
  return member ? { userId: member.userId } : SYSTEM_ACTOR;
}

/**
 * Create one issue from a schedule for `day` (00:00Z; the due date counts
 * from it). Stale default ids (deleted labels, departed assignees) are dropped
 * rather than failing the run.
 */
export async function createFromSchedule(row: RecurringRow, day: Date): Promise<IssueResult> {
  const [props, actor] = await Promise.all([
    sanitizeIssueDefaults(row.projectId, row.data, TEMPLATE_FIELDS),
    actorFor(row),
  ]);
  const dueInDays = dueInDaysOf(row.data);
  const input: CreateIssueInput = {
    ...props,
    title: row.title,
    description: row.description,
    ...(dueInDays !== null ? { dueDate: toDateInput(day.getTime() + dueInDays * DAY_MS) } : {}),
  };
  return createIssue(actor, row.projectId, input);
}

/** Tell the schedule's owner (the issue's creator, so dispatch skips them). */
async function notifyOwner(row: RecurringRow, issue: { id: string; key: string; title: string }) {
  if (!row.createdById) return;
  const [member] = await db
    .select({ prefs: userProfiles.notificationPrefs })
    .from(projectMembers)
    .leftJoin(userProfiles, eq(userProfiles.userId, projectMembers.userId))
    .where(
      and(eq(projectMembers.projectId, row.projectId), eq(projectMembers.userId, row.createdById)),
    )
    .limit(1);
  if (!member || !prefEnabled(member.prefs, 'recurring_created')) return;
  const rows = [
    {
      id: crypto.randomUUID(),
      userId: row.createdById,
      projectId: row.projectId,
      ticketId: issue.id,
      actorId: null,
      type: 'recurring_created',
      data: { key: issue.key, title: issue.title, summary: 'created from a recurring schedule' },
      createdAt: new Date(),
    },
  ];
  await db.insert(notifications).values(rows);
  await deliverToChannels(rows);
}

export interface RecurringRunResult {
  created: number;
  failed: number;
}

/**
 * Create every due occurrence (at most one per schedule per run) and advance
 * `nextRunAt` past today. `projectId` limits the run to one project (the lazy
 * run on the settings page).
 */
export async function runDueRecurringIssues(
  now: Date = new Date(),
  projectId?: string,
): Promise<RecurringRunResult> {
  const due = await db
    .select()
    .from(recurringIssues)
    .where(
      and(
        eq(recurringIssues.enabled, true),
        lte(recurringIssues.nextRunAt, now),
        projectId ? eq(recurringIssues.projectId, projectId) : undefined,
      ),
    )
    .orderBy(asc(recurringIssues.nextRunAt))
    .limit(RUN_LIMIT);

  const result: RecurringRunResult = { created: 0, failed: 0 };
  const broken: string[] = [];
  const tomorrow = utcDay(now).getTime() + DAY_MS;

  for (const row of due) {
    const parsed = normalizeSchedule(row.schedule);
    const next = parsed.ok ? nextOccurrence(parsed.schedule, tomorrow) : null;
    if (!next) {
      broken.push(row.id);
      continue;
    }
    const [claimed] = await db
      .update(recurringIssues)
      .set({ nextRunAt: next, lastRunAt: now })
      .where(
        and(
          eq(recurringIssues.id, row.id),
          eq(recurringIssues.nextRunAt, row.nextRunAt),
          eq(recurringIssues.enabled, true),
        ),
      )
      .returning({ id: recurringIssues.id });
    if (!claimed) continue; // another run got it

    // A caught-up occurrence counts from today, so its due date isn't already past.
    const day = new Date(Math.max(utcDay(row.nextRunAt).getTime(), utcDay(now).getTime()));
    try {
      const created = await createFromSchedule(row, day);
      if (!created.ok) throw new Error(created.error);
      result.created++;
      await notifyOwner(row, created.issue).catch((err) =>
        console.error('[recurring] notify failed', row.id, err),
      );
    } catch (err) {
      result.failed++;
      console.error('[recurring] create failed', row.id, err);
      // Give the occurrence back so the next run retries it.
      await db
        .update(recurringIssues)
        .set({ nextRunAt: row.nextRunAt, lastRunAt: row.lastRunAt })
        .where(and(eq(recurringIssues.id, row.id), eq(recurringIssues.nextRunAt, next)))
        .catch((e) => console.error('[recurring] release failed', row.id, e));
    }
  }

  // Unparseable schedules (hand-edited rows) are paused instead of retried forever.
  if (broken.length) {
    await db
      .update(recurringIssues)
      .set({ enabled: false, updatedAt: now })
      .where(inArray(recurringIssues.id, broken));
  }
  return result;
}

export type { RecurringDefaults, RecurringSchedule };
