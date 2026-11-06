// Cycle actions (write level): create, edit, complete. Every action authorizes
// the project first and scopes each cycle read/write by (cycle id, project id),
// so ids from another project match nothing.

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { cycles, projects } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { isDateString } from '@/lib/dates';
import { completeCycle, findOverlappingCycle, getCycle, insertCycles } from '@/lib/cycles';
import { DAY_MS, cycleName, fromDateInput } from '@/lib/cycle-utils';
import {
  fail,
  isFail,
  optionalText,
  refreshesData,
  type ActionResult,
  type Fail,
} from '@/lib/server/action-kit';

export type CycleField = 'name' | 'description' | 'startDate' | 'endDate';

export type CycleActionResult = ActionResult<{ cycleId: string; message?: string }, CycleField>;

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

type Validated = {
  name: string | null;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
};

function validate(input: Omit<CycleInput, 'projectId'>): Validated | Fail<CycleField> {
  const name = optionalText(input.name, 'name', NAME_MAX);
  if (isFail(name)) return name;
  const description = optionalText(input.description, 'description', DESCRIPTION_MAX);
  if (isFail(description)) return description;
  if (!isDateString(input.startDate)) {
    return fail('Pick a start date.', 'startDate');
  }
  if (!isDateString(input.endDate)) return fail('Pick an end date.', 'endDate');
  const startsAt = fromDateInput(input.startDate);
  const endsAt = new Date(fromDateInput(input.endDate).getTime() + DAY_MS);
  if (endsAt <= startsAt) {
    return fail('The end date must be on or after the start date.', 'endDate');
  }
  if (endsAt.getTime() - startsAt.getTime() > MAX_DAYS * DAY_MS) {
    return fail('A cycle can be at most 26 weeks long.', 'endDate');
  }
  return { name, description, startsAt, endsAt };
}

async function overlapError(
  projectId: string,
  startsAt: Date,
  endsAt: Date,
  exceptId?: string,
): Promise<Fail<CycleField> | null> {
  const other = await findOverlappingCycle(projectId, startsAt, endsAt, exceptId);
  return other
    ? fail(`These dates overlap ${cycleName(other)}.`, 'startDate')
    : null;
}

export async function createCycle(input: CycleInput): Promise<CycleActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const valid = validate(input);
  if (isFail(valid)) return valid;

  const [project] = await db
    .select({ cyclesEnabled: projects.cyclesEnabled })
    .from(projects)
    .where(eq(projects.id, input.projectId))
    .limit(1);
  if (!project?.cyclesEnabled) return fail('Cycles are turned off for this project.');

  const overlap = await overlapError(input.projectId, valid.startsAt, valid.endsAt);
  if (overlap) return overlap;

  try {
    const [cycle] = await insertCycles(input.projectId, [valid]);
    refreshesData();
    return { ok: true, cycleId: cycle.id };
  } catch (err) {
    // Unique (project, number): someone created one at the same moment.
    console.error('[cycles] create failed', err);
    return fail('Could not create the cycle — please try again.');
  }
}

export async function updateCycle(
  input: CycleInput & { cycleId: string },
): Promise<CycleActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const cycle = await getCycle(input.projectId, input.cycleId);
  if (!cycle) return fail('Cycle not found.');
  const valid = validate(input);
  if (isFail(valid)) return valid;

  const datesChanged =
    valid.startsAt.getTime() !== cycle.startsAt.getTime() ||
    valid.endsAt.getTime() !== cycle.endsAt.getTime();
  if (datesChanged) {
    if (cycle.completedAt) {
      return fail('A completed cycle’s dates can’t change.', 'startDate');
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
  refreshesData();
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
    return fail('Cycle not found.');
  }
  const result = await completeCycle({ userId: authz.userId }, input.projectId, input.cycleId, {
    completedAt: new Date(),
    rollover: input.rollover === true,
  });
  if (!result.ok) return result;
  refreshesData();
  const message =
    result.moved > 0 && result.next
      ? `Moved ${result.moved} unfinished issue${result.moved === 1 ? '' : 's'} to ${cycleName(result.next)}`
      : undefined;
  return { ok: true, cycleId: input.cycleId, message };
}
