'use server';

// Cycle actions (write level): create, edit, complete. Every action authorizes
// the project first and scopes each cycle read/write by (cycle id, project id),
// so ids from another project match nothing.

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { cycles, projects } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { isDateString } from '@/lib/dates';
import { completeCycle, findOverlappingCycle, getCycle, insertCycles } from '@/lib/cycles';
import { DAY_MS, cycleName, fromDateInput } from '@/components/cycles/cycle-utils';

export type CycleField = 'name' | 'description' | 'startDate' | 'endDate';

export type CycleActionResult =
  | { ok: true; cycleId: string; message?: string }
  | { ok: false; error: string; field?: CycleField };

export interface CycleInput {
  projectId: string;
  name?: string | null;
  description?: string | null;
  /** YYYY-MM-DD, first day (inclusive). */
  startDate: string;
  /** YYYY-MM-DD, last day (inclusive). */
  endDate: string;
}

const NAME_MAX = 80;
const DESCRIPTION_MAX = 500;
const MAX_DAYS = 26 * 7;

function revalidateCycles(projectId: string) {
  revalidatePath(`/dashboard/projects/${projectId}`, 'layout');
}

type Validated = {
  name: string | null;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
};

function validate(input: Omit<CycleInput, 'projectId'>): Validated | Extract<CycleActionResult, { ok: false }> {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length > NAME_MAX) {
    return { ok: false, error: `Name must be ${NAME_MAX} characters or fewer.`, field: 'name' };
  }
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (description.length > DESCRIPTION_MAX) {
    return {
      ok: false,
      error: `Description must be ${DESCRIPTION_MAX} characters or fewer.`,
      field: 'description',
    };
  }
  if (!isDateString(input.startDate)) {
    return { ok: false, error: 'Pick a start date.', field: 'startDate' };
  }
  if (!isDateString(input.endDate)) return { ok: false, error: 'Pick an end date.', field: 'endDate' };
  const startsAt = fromDateInput(input.startDate);
  const endsAt = new Date(fromDateInput(input.endDate).getTime() + DAY_MS);
  if (endsAt <= startsAt) {
    return { ok: false, error: 'The end date must be on or after the start date.', field: 'endDate' };
  }
  if (endsAt.getTime() - startsAt.getTime() > MAX_DAYS * DAY_MS) {
    return { ok: false, error: 'A cycle can be at most 26 weeks long.', field: 'endDate' };
  }
  return { name: name || null, description: description || null, startsAt, endsAt };
}

async function overlapError(
  projectId: string,
  startsAt: Date,
  endsAt: Date,
  exceptId?: string,
): Promise<Extract<CycleActionResult, { ok: false }> | null> {
  const other = await findOverlappingCycle(projectId, startsAt, endsAt, exceptId);
  return other
    ? { ok: false, error: `These dates overlap ${cycleName(other)}.`, field: 'startDate' }
    : null;
}

export async function createCycle(input: CycleInput): Promise<CycleActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const valid = validate(input);
  if ('ok' in valid) return valid;

  const [project] = await db
    .select({ cyclesEnabled: projects.cyclesEnabled })
    .from(projects)
    .where(eq(projects.id, input.projectId))
    .limit(1);
  if (!project?.cyclesEnabled) return { ok: false, error: 'Cycles are turned off for this project.' };

  const overlap = await overlapError(input.projectId, valid.startsAt, valid.endsAt);
  if (overlap) return overlap;

  try {
    const [cycle] = await insertCycles(input.projectId, [valid]);
    revalidateCycles(input.projectId);
    return { ok: true, cycleId: cycle.id };
  } catch (err) {
    // Unique (project, number): someone created one at the same moment.
    console.error('[cycles] create failed', err);
    return { ok: false, error: 'Could not create the cycle — please try again.' };
  }
}

export async function updateCycle(
  input: CycleInput & { cycleId: string },
): Promise<CycleActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const cycle = await getCycle(input.projectId, input.cycleId);
  if (!cycle) return { ok: false, error: 'Cycle not found.' };
  const valid = validate(input);
  if ('ok' in valid) return valid;

  const datesChanged =
    valid.startsAt.getTime() !== cycle.startsAt.getTime() ||
    valid.endsAt.getTime() !== cycle.endsAt.getTime();
  if (datesChanged) {
    if (cycle.completedAt) {
      return { ok: false, error: 'A completed cycle’s dates can’t change.', field: 'startDate' };
    }
    const overlap = await overlapError(input.projectId, valid.startsAt, valid.endsAt, cycle.id);
    if (overlap) return overlap;
  }

  await db
    .update(cycles)
    .set({
      name: valid.name,
      description: valid.description,
      ...(datesChanged ? { startsAt: valid.startsAt, endsAt: valid.endsAt } : {}),
    })
    .where(and(eq(cycles.id, cycle.id), eq(cycles.projectId, input.projectId)));
  revalidateCycles(input.projectId);
  return { ok: true, cycleId: cycle.id };
}

export async function completeCycleAction(input: {
  projectId: string;
  cycleId: string;
  /** Move unfinished issues into the next open cycle. */
  rollover: boolean;
}): Promise<CycleActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  if (typeof input.cycleId !== 'string' || !input.cycleId) {
    return { ok: false, error: 'Cycle not found.' };
  }
  const result = await completeCycle({ userId: authz.userId }, input.projectId, input.cycleId, {
    completedAt: new Date(),
    rollover: input.rollover === true,
  });
  if (!result.ok) return result;
  revalidateCycles(input.projectId);
  const message =
    result.moved > 0 && result.next
      ? `Moved ${result.moved} unfinished issue${result.moved === 1 ? '' : 's'} to ${cycleName(result.next)}`
      : undefined;
  return { ok: true, cycleId: input.cycleId, message };
}
