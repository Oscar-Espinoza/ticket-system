// Project planning + automation settings (admin level): cycles cadence and
// cooldown, triage, auto-archive / auto-close. Saving cycle settings schedules cycles right away
// instead of waiting for the next daily automation run.

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { ensureUpcomingCycles, getProjectCycles, rescheduleUpcomingCycles } from '@/lib/cycles';
import {
  AUTOMATION_MONTHS,
  MAX_COOLDOWN_WEEKS,
  MAX_CYCLE_WEEKS,
  MIN_CYCLE_WEEKS,
  WEEKDAYS,
  type CycleCadence,
} from '@/lib/cycle-utils';
import { fail, refreshesData, type ActionResult } from '@/lib/server/action-kit';

export type SettingsActionResult = ActionResult;

export interface PlanningSettingsInput {
  projectId: string;
  cyclesEnabled: boolean;
  /** MIN_CYCLE_WEEKS … MAX_CYCLE_WEEKS */
  durationWeeks: number;
  /** 0 = Sunday … 6 = Saturday */
  startWeekday: number;
  /** Weeks between cycles, 0 … MAX_COOLDOWN_WEEKS. */
  cooldownWeeks: number;
  autoCreate: boolean;
  /** Move unfinished issues to the next cycle when a cycle auto-completes. */
  autoRollover: boolean;
  triageEnabled: boolean;
}

export async function updatePlanningSettings(
  input: PlanningSettingsInput,
): Promise<SettingsActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'admin');
  if (!authz.ok) return authz;
  const { projectId } = input;

  const duration = input.durationWeeks;
  if (!Number.isInteger(duration) || duration < MIN_CYCLE_WEEKS || duration > MAX_CYCLE_WEEKS) {
    return fail(`Cycle duration must be ${MIN_CYCLE_WEEKS} to ${MAX_CYCLE_WEEKS} weeks.`);
  }
  const weekday = input.startWeekday;
  if (!Number.isInteger(weekday) || weekday < 0 || weekday >= WEEKDAYS.length) {
    return fail('Invalid start day.');
  }
  const cooldown = input.cooldownWeeks ?? 0;
  if (!Number.isInteger(cooldown) || cooldown < 0 || cooldown > MAX_COOLDOWN_WEEKS) {
    return fail(`Cooldown must be 0 to ${MAX_COOLDOWN_WEEKS} weeks.`);
  }
  const cyclesEnabled = input.cyclesEnabled === true;
  const autoCreate = input.autoCreate === true;

  const [[before], existing] = await Promise.all([
    db
      .select({
        durationWeeks: projects.cycleDurationWeeks,
        startWeekday: projects.cycleStartWeekday,
        cooldownWeeks: projects.cycleCooldownWeeks,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1),
    getProjectCycles(projectId),
  ]);
  if (!before) return fail('Project not found.');

  await db
    .update(projects)
    .set({
      cyclesEnabled,
      cycleDurationWeeks: duration,
      cycleStartWeekday: weekday,
      cycleCooldownWeeks: cooldown,
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
        (before.durationWeeks !== duration ||
          before.startWeekday !== weekday ||
          before.cooldownWeeks !== cooldown);
      const cadence: CycleCadence = { durationWeeks: duration, weekday, cooldownWeeks: cooldown };
      const now = new Date();
      if (cadenceChanged) await rescheduleUpcomingCycles(projectId, cadence, now);
      if (autoCreate) await ensureUpcomingCycles(projectId, cadence, now);
    } catch (err) {
      // Settings are saved; the daily automation run retries the scheduling.
      console.error('[planning] cycle scheduling failed', err);
    }
  }

  refreshesData();
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
    return fail('Invalid period.');
  }
  await db
    .update(projects)
    .set({
      autoArchiveMonths: input.autoArchiveMonths,
      autoCloseMonths: input.autoCloseMonths,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, input.projectId));
  refreshesData();
  return { ok: true };
}
