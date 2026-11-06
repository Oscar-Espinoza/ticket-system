// Epic, milestone and epic-update mutations. Every action authorizes with
// authorizeProjectAction first, then scopes each write by (id, projectId) —
// milestones and updates through their epic — so ids from another project
// match nothing. Referenced users (lead) must be project members.

import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { epicUpdates, epics, milestones } from '@/db/schema';
import { authorizeProjectAction, roleAllows } from '@/lib/action-auth';
import { isHexColor } from '@/lib/colors';
import { isDateString } from '@/lib/dates';
import { getCrossProjectEpicOptions } from '@/lib/epics';
import { emitIssueEvent } from '@/lib/events';
import { getMemberProject } from '@/lib/project-access';
import {
  fail,
  isFail,
  refreshesData,
  requiredText,
  type ActionResult,
  type Fail,
} from '@/lib/server/action-kit';
import {
  DEFAULT_EPIC_COLOR,
  EPIC_DESCRIPTION_MAX,
  EPIC_NAME_MAX,
  HEALTH_LABEL,
  UPDATE_BODY_MAX,
  canDeleteUpdate,
  isEpicStatus,
  isHealth,
  type EpicStatus,
  type ForeignEpicOption,
  type Health,
} from '@/lib/epic-model';

export type EpicActionResult = ActionResult<{ id?: string }>;

const MILESTONE_NAME_MAX = 80;

function looseText(value: unknown, max: number, field: string): string | null | Fail {
  if (value == null) return null;
  if (typeof value !== 'string') return fail('Invalid text.', field);
  if (value.length > max) return fail(`Must be ${max} characters or fewer.`, field);
  return value.trim() ? value : null;
}

function optionalDate(value: unknown, field: string): string | null | Fail {
  if (value == null || value === '') return null;
  return isDateString(value) ? value : fail('Invalid date.', field);
}

async function loadEpic(projectId: string, epicId: unknown) {
  if (typeof epicId !== 'string' || !epicId) return null;
  const [epic] = await db
    .select({
      id: epics.id,
      name: epics.name,
      startDate: epics.startDate,
      targetDate: epics.targetDate,
    })
    .from(epics)
    .where(and(eq(epics.id, epicId), eq(epics.projectId, projectId)))
    .limit(1);
  return epic ?? null;
}

/** The milestone, only when its epic belongs to the project. */
async function loadMilestone(projectId: string, milestoneId: unknown) {
  if (typeof milestoneId !== 'string' || !milestoneId) return null;
  const [milestone] = await db
    .select({ id: milestones.id, epicId: milestones.epicId })
    .from(milestones)
    .innerJoin(epics, eq(milestones.epicId, epics.id))
    .where(and(eq(milestones.id, milestoneId), eq(epics.projectId, projectId)))
    .limit(1);
  return milestone ?? null;
}

// ---------------------------------------------------------------------------
// Epics
// ---------------------------------------------------------------------------

export interface EpicInput {
  name?: string;
  description?: string | null;
  status?: EpicStatus;
  health?: Health | null;
  leadId?: string | null;
  startDate?: string | null;
  targetDate?: string | null;
  color?: string | null;
}

type EpicChanges = Partial<{
  name: string;
  description: string | null;
  status: EpicStatus;
  health: Health | null;
  leadId: string | null;
  startDate: string | null;
  targetDate: string | null;
  color: string | null;
}>;

/** Validates the provided fields (absent = untouched). */
async function validateEpicInput(
  projectId: string,
  input: EpicInput,
): Promise<EpicChanges | Fail> {
  const changes: EpicChanges = {};
  if (input.name !== undefined) {
    const value = requiredText(input.name, 'name', EPIC_NAME_MAX);
    if (isFail(value)) return value;
    changes.name = value;
  }
  if (input.description !== undefined) {
    const value = looseText(input.description, EPIC_DESCRIPTION_MAX, 'description');
    if (isFail(value)) return value;
    changes.description = value;
  }
  if (input.status !== undefined) {
    if (!isEpicStatus(input.status)) return fail('Invalid status.', 'status');
    changes.status = input.status;
  }
  if (input.health !== undefined) {
    if (input.health !== null && !isHealth(input.health)) return fail('Invalid health.', 'health');
    changes.health = input.health;
  }
  if (input.leadId !== undefined) {
    if (input.leadId !== null) {
      if (typeof input.leadId !== 'string' || !(await getMemberProject(projectId, input.leadId))) {
        return fail('The lead must be a project member.', 'leadId');
      }
    }
    changes.leadId = input.leadId;
  }
  for (const field of ['startDate', 'targetDate'] as const) {
    if (input[field] === undefined) continue;
    const value = optionalDate(input[field], field);
    if (isFail(value)) return value;
    changes[field] = value;
  }
  if (input.color !== undefined) {
    if (input.color !== null && !isHexColor(input.color)) {
      return fail('Invalid color.', 'color');
    }
    changes.color = input.color?.toLowerCase() ?? null;
  }
  return changes;
}

function datesInOrder(start: string | null | undefined, target: string | null | undefined) {
  return !start || !target || start <= target;
}

export async function createEpic(input: EpicInput & { projectId: string }): Promise<EpicActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const { projectId } = input;

  const changes = await validateEpicInput(projectId, { ...input, name: input.name ?? '' });
  if (isFail(changes)) return changes;
  if (!datesInOrder(changes.startDate, changes.targetDate)) {
    return fail('The target date must be on or after the start date.', 'targetDate');
  }

  const [{ max }] = await db
    .select({ max: sql<number | null>`max(${epics.sortOrder})` })
    .from(epics)
    .where(eq(epics.projectId, projectId));
  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(epics).values({
    id,
    projectId,
    name: changes.name!,
    description: changes.description ?? null,
    status: changes.status ?? 'planned',
    health: changes.health ?? null,
    leadId: changes.leadId ?? null,
    startDate: changes.startDate ?? null,
    targetDate: changes.targetDate ?? null,
    color: changes.color ?? DEFAULT_EPIC_COLOR,
    sortOrder: (max ?? 0) + 1,
    createdAt: now,
    updatedAt: now,
  });
  refreshesData();
  return { ok: true, id };
}

export async function updateEpic(input: {
  projectId: string;
  id: string;
  patch: EpicInput;
}): Promise<EpicActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const { projectId } = input;

  const epic = await loadEpic(projectId, input.id);
  if (!epic) return fail('Epic not found.');
  const changes = await validateEpicInput(projectId, input.patch ?? {});
  if (isFail(changes)) return changes;
  if (Object.keys(changes).length === 0) return { ok: true, id: epic.id };

  const start = changes.startDate !== undefined ? changes.startDate : epic.startDate;
  const target = changes.targetDate !== undefined ? changes.targetDate : epic.targetDate;
  if (!datesInOrder(start, target)) {
    return fail('The target date must be on or after the start date.', 'targetDate');
  }

  await db
    .update(epics)
    .set({ ...changes, updatedAt: new Date() })
    .where(and(eq(epics.id, epic.id), eq(epics.projectId, projectId)));
  refreshesData();
  return { ok: true, id: epic.id };
}

async function setArchived(
  input: { projectId: string; id: string },
  archivedAt: Date | null,
): Promise<EpicActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const updated = await db
    .update(epics)
    .set({ archivedAt, updatedAt: new Date() })
    .where(and(eq(epics.id, input.id), eq(epics.projectId, input.projectId)))
    .returning({ id: epics.id });
  if (updated.length === 0) return fail('Epic not found.');
  refreshesData();
  return { ok: true, id: input.id };
}

/** Hides the epic from pickers and the roadmap; its issues keep the link. */
export async function archiveEpic(input: { projectId: string; id: string }) {
  return setArchived(input, new Date());
}

export async function unarchiveEpic(input: { projectId: string; id: string }) {
  return setArchived(input, null);
}

// ---------------------------------------------------------------------------
// Cross-project epics
// ---------------------------------------------------------------------------

/**
 * Epics of other projects in the workspace that this project's issues may
 * join (the issue pickers load them lazily). Read level: guests see the
 * current value's name too.
 */
export async function listAvailableEpics(input: {
  projectId: string;
}): Promise<{ ok: true; epics: ForeignEpicOption[] } | { ok: false; error: string }> {
  const authz = await authorizeProjectAction(input?.projectId, 'read');
  if (!authz.ok) return authz;
  return { ok: true, epics: await getCrossProjectEpicOptions(input.projectId, authz.userId) };
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export async function createMilestone(input: {
  projectId: string;
  epicId: string;
  name: string;
  targetDate?: string | null;
}): Promise<EpicActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const epic = await loadEpic(input.projectId, input.epicId);
  if (!epic) return fail('Epic not found.');
  const milestoneName = requiredText(input.name, 'name', MILESTONE_NAME_MAX);
  if (isFail(milestoneName)) return milestoneName;
  const targetDate = optionalDate(input.targetDate, 'targetDate');
  if (isFail(targetDate)) return targetDate;

  const [{ max }] = await db
    .select({ max: sql<number | null>`max(${milestones.sortOrder})` })
    .from(milestones)
    .where(eq(milestones.epicId, epic.id));
  const id = crypto.randomUUID();
  await db.insert(milestones).values({
    id,
    epicId: epic.id,
    name: milestoneName,
    targetDate,
    sortOrder: (max ?? 0) + 1,
    createdAt: new Date(),
  });
  refreshesData();
  return { ok: true, id };
}

export async function updateMilestone(input: {
  projectId: string;
  id: string;
  name?: string;
  description?: string | null;
  targetDate?: string | null;
}): Promise<EpicActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const milestone = await loadMilestone(input.projectId, input.id);
  if (!milestone) return fail('Milestone not found.');

  const changes: { name?: string; description?: string | null; targetDate?: string | null } = {};
  if (input.name !== undefined) {
    const value = requiredText(input.name, 'name', MILESTONE_NAME_MAX);
    if (isFail(value)) return value;
    changes.name = value;
  }
  if (input.description !== undefined) {
    const value = looseText(input.description, EPIC_DESCRIPTION_MAX, 'description');
    if (isFail(value)) return value;
    changes.description = value;
  }
  if (input.targetDate !== undefined) {
    const value = optionalDate(input.targetDate, 'targetDate');
    if (isFail(value)) return value;
    changes.targetDate = value;
  }
  if (Object.keys(changes).length === 0) return { ok: true, id: milestone.id };

  await db.update(milestones).set(changes).where(eq(milestones.id, milestone.id));
  refreshesData();
  return { ok: true, id: milestone.id };
}

/** Issues on the milestone keep their epic; milestone_id is set null by the FK. */
export async function deleteMilestone(input: {
  projectId: string;
  id: string;
}): Promise<EpicActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const milestone = await loadMilestone(input.projectId, input.id);
  if (!milestone) return fail('Milestone not found.');
  await db.delete(milestones).where(eq(milestones.id, milestone.id));
  refreshesData();
  return { ok: true };
}

/** `ids` must be exactly the epic's milestones, in their new order. */
export async function reorderMilestones(input: {
  projectId: string;
  epicId: string;
  ids: string[];
}): Promise<EpicActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const epic = await loadEpic(input.projectId, input.epicId);
  if (!epic) return fail('Epic not found.');
  if (!Array.isArray(input.ids) || input.ids.some((id) => typeof id !== 'string')) {
    return fail('Invalid order.');
  }

  const current = await db
    .select({ id: milestones.id })
    .from(milestones)
    .where(eq(milestones.epicId, epic.id));
  const known = new Set(current.map((m) => m.id));
  if (
    input.ids.length !== known.size ||
    new Set(input.ids).size !== known.size ||
    input.ids.some((id) => !known.has(id))
  ) {
    return fail('The milestones changed meanwhile — refresh and try again.');
  }
  if (input.ids.length === 0) return { ok: true };

  const [first, ...rest] = input.ids.map((id, index) =>
    db
      .update(milestones)
      .set({ sortOrder: index + 1 })
      .where(and(eq(milestones.id, id), eq(milestones.epicId, epic.id))),
  );
  await db.batch([first, ...rest]);
  refreshesData();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Epic updates (health posts)
// ---------------------------------------------------------------------------

export async function postEpicUpdate(input: {
  projectId: string;
  epicId: string;
  health: Health;
  body: string;
}): Promise<EpicActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const epic = await loadEpic(input.projectId, input.epicId);
  if (!epic) return fail('Epic not found.');
  if (!isHealth(input.health)) return fail('Pick a health status.', 'health');
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (!body) return fail('Write a short update.', 'body');
  if (body.length > UPDATE_BODY_MAX) {
    return fail(`Updates must be ${UPDATE_BODY_MAX} characters or fewer.`, 'body');
  }

  const now = new Date();
  const id = crypto.randomUUID();
  // One round trip, all-or-nothing: the update and the epic's new health.
  await db.batch([
    db.insert(epicUpdates).values({
      id,
      epicId: epic.id,
      authorId: authz.userId,
      health: input.health,
      body,
      createdAt: now,
    }),
    db.update(epics).set({ health: input.health, updatedAt: now }).where(eq(epics.id, epic.id)),
  ]);

  await emitIssueEvent([
    {
      projectId: input.projectId,
      ticketId: null,
      actorId: authz.userId,
      type: 'epic.update_posted',
      data: {
        summary: `posted an update on ${epic.name} (${HEALTH_LABEL[input.health]})`,
        epicId: epic.id,
        epicName: epic.name,
        updateId: id,
        health: input.health,
      },
    },
  ]);
  refreshesData();
  return { ok: true, id };
}

/** Author or project admin. The epic's health falls back to the newest remaining update. */
export async function deleteEpicUpdate(input: {
  projectId: string;
  id: string;
}): Promise<EpicActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  if (typeof input.id !== 'string' || !input.id) return fail('Update not found.');

  const [update] = await db
    .select({ id: epicUpdates.id, epicId: epicUpdates.epicId, authorId: epicUpdates.authorId })
    .from(epicUpdates)
    .innerJoin(epics, eq(epicUpdates.epicId, epics.id))
    .where(and(eq(epicUpdates.id, input.id), eq(epics.projectId, input.projectId)))
    .limit(1);
  if (!update) return fail('Update not found.');
  if (!canDeleteUpdate(roleAllows(authz.role, 'admin'), update.authorId, authz.userId)) {
    return fail('Only the author or a project admin can delete this update.');
  }

  await db.delete(epicUpdates).where(eq(epicUpdates.id, update.id));
  const [latest] = await db
    .select({ health: epicUpdates.health })
    .from(epicUpdates)
    .where(eq(epicUpdates.epicId, update.epicId))
    .orderBy(desc(epicUpdates.createdAt))
    .limit(1);
  if (latest) {
    await db
      .update(epics)
      .set({ health: latest.health })
      .where(and(eq(epics.id, update.epicId), eq(epics.projectId, input.projectId)));
  }
  refreshesData();
  return { ok: true };
}
