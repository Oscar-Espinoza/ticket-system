'use server';

// Project planning + automation settings (admin level): cycles cadence, triage,
// auto-archive / auto-close. Saving cycle settings schedules cycles right away
// instead of waiting for the next daily automation run.

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { ensureUpcomingCycles, getProjectCycles, rescheduleUpcomingCycles } from '@/lib/cycles';
import { AUTOMATION_MONTHS } from '@/components/cycles/cycle-utils';

export type SettingsActionResult = { ok: true } | { ok: false; error: string };

export interface PlanningSettingsInput {
  projectId: string;
  cyclesEnabled: boolean;
  /** 1–8 */
  durationWeeks: number;
  /** 0 = Sunday … 6 = Saturday */
  startWeekday: number;
  autoCreate: boolean;
  /** Move unfinished issues to the next cycle when a cycle auto-completes. */
  autoRollover: boolean;
  triageEnabled: boolean;
}

function revalidateProject(projectId: string) {
  revalidatePath(`/dashboard/projects/${projectId}`, 'layout');
}

export async function updatePlanningSettings(
  input: PlanningSettingsInput,
): Promise<SettingsActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'admin');
  if (!authz.ok) return authz;
  const { projectId } = input;

  const duration = input.durationWeeks;
  if (!Number.isInteger(duration) || duration < 1 || duration > 8) {
    return { ok: false, error: 'Cycle duration must be 1 to 8 weeks.' };
  }
  const weekday = input.startWeekday;
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return { ok: false, error: 'Invalid start day.' };
  }
  const cyclesEnabled = input.cyclesEnabled === true;
  const autoCreate = input.autoCreate === true;

  const [[before], existing] = await Promise.all([
    db
      .select({
        durationWeeks: projects.cycleDurationWeeks,
        startWeekday: projects.cycleStartWeekday,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1),
    getProjectCycles(projectId),
  ]);
  if (!before) return { ok: false, error: 'Project not found.' };

  await db
    .update(projects)
    .set({
      cyclesEnabled,
      cycleDurationWeeks: duration,
      cycleStartWeekday: weekday,
      cycleAutoCreate: autoCreate,
      cycleAutoRollover: input.autoRollover === true,
      triageEnabled: input.triageEnabled === true,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  if (cyclesEnabled) {
    try {
      const cadenceChanged =
        existing.length > 0 &&
        (before.durationWeeks !== duration || before.startWeekday !== weekday);
      if (cadenceChanged) await rescheduleUpcomingCycles(projectId, duration, weekday);
      if (autoCreate) await ensureUpcomingCycles(projectId, duration, new Date(), weekday);
    } catch (err) {
      // Settings are saved; the daily automation run retries the scheduling.
      console.error('[planning] cycle scheduling failed', err);
    }
  }

  revalidateProject(projectId);
  return { ok: true };
}

function validMonths(value: unknown): value is number | null {
  return value === null || (AUTOMATION_MONTHS as readonly unknown[]).includes(value);
}

export async function updateAutomationSettings(input: {
  projectId: string;
  autoArchiveMonths: number | null;
  autoCloseMonths: number | null;
}): Promise<SettingsActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'admin');
  if (!authz.ok) return authz;
  if (!validMonths(input.autoArchiveMonths) || !validMonths(input.autoCloseMonths)) {
    return { ok: false, error: 'Invalid period.' };
  }
  await db
    .update(projects)
    .set({
      autoArchiveMonths: input.autoArchiveMonths,
      autoCloseMonths: input.autoCloseMonths,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, input.projectId));
  revalidateProject(input.projectId);
  return { ok: true };
}
