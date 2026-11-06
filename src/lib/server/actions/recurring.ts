// Recurring issue schedules. Writers (members and up) manage them — the same
// bar as creating issues; every row is addressed by (projectId, id).

import { and, count, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { recurringIssues } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { DESCRIPTION_MAX, TITLE_MAX } from '@/lib/issue-service';
import {
  createFromSchedule,
  firstRunFrom,
  toRecurringIssue,
  type RecurringRow,
} from '@/lib/recurring';
import { sanitizeIssueDefaults, TEMPLATE_FIELDS } from '@/lib/issue-defaults';
import { utcDay } from '@/lib/cycle-utils';
import {
  fail,
  isFail,
  optionalText,
  refreshesData,
  requiredText,
  type ActionResult,
} from '@/lib/server/action-kit';
import {
  DUE_IN_DAYS_MAX,
  normalizeSchedule,
  sameSchedule,
  type RecurringDefaults,
  type RecurringIssue,
  type RecurringSchedule,
} from '@/lib/recurring-schedule';

type Field = 'title' | 'description' | 'schedule' | 'dueInDays';
export type RecurringResult = ActionResult<{ recurring: RecurringIssue }, Field>;

const MAX_PER_PROJECT = 50;

interface RecurringInput {
  projectId: string;
  title: string;
  description?: string;
  data: RecurringDefaults;
  schedule: RecurringSchedule;
}

/** Shape + ownership checks shared by create and update. */
async function validate(input: RecurringInput) {
  const title = requiredText(input.title, 'title', TITLE_MAX);
  if (isFail(title)) return title;
  const description = optionalText(input.description, 'description', DESCRIPTION_MAX);
  if (isFail(description)) return description;
  const parsed = normalizeSchedule(input.schedule);
  if (!parsed.ok) return fail(parsed.error, 'schedule');

  const raw = input.data && typeof input.data === 'object' ? input.data : {};
  const dueInDays = raw.dueInDays ?? null;
  if (
    dueInDays !== null &&
    (!Number.isInteger(dueInDays) || dueInDays < 0 || dueInDays > DUE_IN_DAYS_MAX)
  ) {
    return fail(`Due in 0 to ${DUE_IN_DAYS_MAX} days, or leave it empty.`, 'dueInDays');
  }
  // Only ids of this project survive.
  const props = await sanitizeIssueDefaults(input.projectId, raw, TEMPLATE_FIELDS);
  const data: RecurringDefaults = { ...props, ...(dueInDays !== null ? { dueInDays } : {}) };
  return {
    ok: true as const,
    title,
    description,
    data,
    schedule: parsed.schedule,
  };
}

async function findRow(projectId: string, id: unknown): Promise<RecurringRow | null> {
  if (typeof id !== 'string' || !id) return null;
  const [row] = await db
    .select()
    .from(recurringIssues)
    .where(and(eq(recurringIssues.projectId, projectId), eq(recurringIssues.id, id)))
    .limit(1);
  return row ?? null;
}

const NO_RUNS = fail('This schedule never runs — check the start date and repeat settings.', 'schedule');

export async function createRecurringIssue(input: RecurringInput): Promise<RecurringResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const valid = await validate(input);
  if (!valid.ok) return valid;

  const [{ total }] = await db
    .select({ total: count() })
    .from(recurringIssues)
    .where(eq(recurringIssues.projectId, input.projectId));
  if (total >= MAX_PER_PROJECT) {
    return fail(`A project can have at most ${MAX_PER_PROJECT} recurring issues.`);
  }

  const now = new Date();
  const nextRunAt = firstRunFrom(valid.schedule, now, null);
  if (!nextRunAt) return NO_RUNS;
  const [row] = await db
    .insert(recurringIssues)
    .values({
      id: crypto.randomUUID(),
      projectId: input.projectId,
      createdById: authz.userId,
      title: valid.title,
      description: valid.description,
      data: valid.data as Record<string, unknown>,
      schedule: valid.schedule as unknown as Record<string, unknown>,
      nextRunAt,
      lastRunAt: null,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  refreshesData();
  return { ok: true, recurring: toRecurringIssue(row) };
}

export async function updateRecurringIssue(
  input: RecurringInput & { id: string },
): Promise<RecurringResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const existing = await findRow(input.projectId, input.id);
  if (!existing) return fail('Recurring issue not found.');
  const valid = await validate(input);
  if (!valid.ok) return valid;

  // Only a cadence change moves the next run (never back onto today's issue).
  const before = normalizeSchedule(existing.schedule);
  const cadenceChanged = !before.ok || !sameSchedule(before.schedule, valid.schedule);
  let nextRunAt = existing.nextRunAt;
  if (cadenceChanged) {
    const next = firstRunFrom(valid.schedule, new Date(), existing.lastRunAt);
    if (!next) return NO_RUNS;
    nextRunAt = next;
  }
  const [row] = await db
    .update(recurringIssues)
    .set({
      title: valid.title,
      description: valid.description,
      data: valid.data as Record<string, unknown>,
      schedule: valid.schedule as unknown as Record<string, unknown>,
      nextRunAt,
      updatedAt: new Date(),
    })
    .where(and(eq(recurringIssues.projectId, input.projectId), eq(recurringIssues.id, existing.id)))
    .returning();
  if (!row) return fail('Recurring issue not found.');
  refreshesData();
  return { ok: true, recurring: toRecurringIssue(row) };
}

export async function setRecurringIssueEnabled(input: {
  projectId: string;
  id: string;
  enabled: boolean;
}): Promise<RecurringResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const existing = await findRow(input.projectId, input.id);
  if (!existing) return fail('Recurring issue not found.');
  const enabled = input.enabled === true;

  let nextRunAt = existing.nextRunAt;
  if (enabled && !existing.enabled) {
    // Resuming doesn't back-fill the paused period.
    const parsed = normalizeSchedule(existing.schedule);
    const next = parsed.ok ? firstRunFrom(parsed.schedule, new Date(), existing.lastRunAt) : null;
    if (!next) return NO_RUNS;
    nextRunAt = next;
  }
  const [row] = await db
    .update(recurringIssues)
    .set({ enabled, nextRunAt, updatedAt: new Date() })
    .where(and(eq(recurringIssues.projectId, input.projectId), eq(recurringIssues.id, existing.id)))
    .returning();
  if (!row) return fail('Recurring issue not found.');
  refreshesData();
  return { ok: true, recurring: toRecurringIssue(row) };
}

export async function deleteRecurringIssue(input: {
  projectId: string;
  id: string;
}): Promise<ActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  if (typeof input.id !== 'string' || !input.id) return fail('Recurring issue not found.');
  const [row] = await db
    .delete(recurringIssues)
    .where(and(eq(recurringIssues.projectId, input.projectId), eq(recurringIssues.id, input.id)))
    .returning({ id: recurringIssues.id });
  if (!row) return fail('Recurring issue not found.');
  refreshesData();
  return { ok: true };
}

/** Create one issue now; the schedule itself is untouched. */
export async function runRecurringIssueNow(input: {
  projectId: string;
  id: string;
}): Promise<ActionResult<{ key: string }>> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const existing = await findRow(input.projectId, input.id);
  if (!existing) return fail('Recurring issue not found.');

  // Created as the person clicking, like any manual create.
  const result = await createFromSchedule(
    { ...existing, createdById: authz.userId },
    utcDay(new Date()),
  );
  if (!result.ok) return fail(result.error);
  refreshesData();
  return { ok: true, key: result.issue.key };
}
