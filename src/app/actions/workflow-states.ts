'use server';

// Workflow-state management (settings › Workflow), admin level.
//
// Positions only order states *within* a type (sortStates sorts by type
// first), so reordering rewrites 0..n for that type alone. Deleting a state
// moves every one of its issues — archived and trashed too, since
// ticket.state_id is ON DELETE RESTRICT — to a replacement state in the same
// db.batch as the delete, recomputing lifecycle timestamps in SQL for the type
// change (same rule as stateTransitionTimestamps). Each action writes one
// project-level activity row (ticketId null) with a `summary`.

import { revalidatePath } from 'next/cache';
import { and, eq, ne, sql, type SQL } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';

import { db } from '@/lib/db';
import { projects, tickets, workflowStates } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { emitIssueEvent, prepareIssueEvents, publishIssueEvents } from '@/lib/events';
import { isStateType, STATE_TYPE_LABEL, type StateType } from '@/lib/issue-model';

export type WorkflowStateField = 'name' | 'color' | 'description' | 'type' | 'replacementId';

export type WorkflowStateResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; field?: WorkflowStateField };

const NAME_MAX = 40;
const DESCRIPTION_MAX = 200;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const DUPLICATE: WorkflowStateResult = {
  ok: false,
  error: 'A state with this name already exists.',
  field: 'name',
};

function validateName(name: unknown): string | WorkflowStateResult {
  const value = typeof name === 'string' ? name.trim() : '';
  if (!value) return { ok: false, error: 'Name is required.', field: 'name' };
  if (value.length > NAME_MAX) {
    return { ok: false, error: `Name must be ${NAME_MAX} characters or fewer.`, field: 'name' };
  }
  return value;
}

function validateColor(color: unknown): string | WorkflowStateResult {
  if (typeof color !== 'string' || !COLOR_RE.test(color)) {
    return { ok: false, error: 'Color must be a hex value like #5e6ad2.', field: 'color' };
  }
  return color.toLowerCase();
}

function validateDescription(value: unknown): string | null | WorkflowStateResult {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > DESCRIPTION_MAX) {
    return {
      ok: false,
      error: `Description must be ${DESCRIPTION_MAX} characters or fewer.`,
      field: 'description',
    };
  }
  return value.trim() || null;
}

const isError = (value: unknown): value is WorkflowStateResult =>
  typeof value === 'object' && value !== null && 'ok' in value;

function isUniqueViolation(err: unknown) {
  const code =
    (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === '23505';
}

async function nameTaken(projectId: string, name: string, exceptId?: string) {
  const [row] = await db
    .select({ id: workflowStates.id })
    .from(workflowStates)
    .where(
      and(
        eq(workflowStates.projectId, projectId),
        sql`lower(${workflowStates.name}) = lower(${name})`,
        exceptId ? ne(workflowStates.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function projectStates(projectId: string) {
  return db
    .select({
      id: workflowStates.id,
      name: workflowStates.name,
      type: workflowStates.type,
      color: workflowStates.color,
      description: workflowStates.description,
      position: workflowStates.position,
    })
    .from(workflowStates)
    .where(eq(workflowStates.projectId, projectId));
}

function revalidate(projectId: string) {
  // States feed every picker, list group and board column in the project.
  revalidatePath(`/dashboard/projects/${projectId}`, 'layout');
}

function activity(projectId: string, actorId: string, type: string, data: Record<string, unknown>) {
  return { projectId, ticketId: null, actorId, type, data };
}

export async function createWorkflowState(input: {
  projectId: string;
  type: StateType;
  name: string;
  color: string;
  description?: string | null;
}): Promise<WorkflowStateResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'admin');
  if (!authz.ok) return authz;

  if (!isStateType(input.type)) return { ok: false, error: 'Pick a state type.', field: 'type' };
  const name = validateName(input.name);
  if (isError(name)) return name;
  const color = validateColor(input.color);
  if (isError(color)) return color;
  const description = validateDescription(input.description);
  if (isError(description)) return description;

  const states = await projectStates(input.projectId);
  const sameType = states.filter((s) => s.type === input.type);
  // Linear has a single triage inbox; B7's triage view assumes one.
  if (input.type === 'triage' && sameType.length > 0) {
    return { ok: false, error: 'A project has at most one triage state.', field: 'type' };
  }
  if (states.some((s) => s.name.toLowerCase() === name.toLowerCase())) return DUPLICATE;

  const id = crypto.randomUUID();
  const position = sameType.reduce((max, s) => Math.max(max, s.position), -1) + 1;
  try {
    await db.insert(workflowStates).values({
      id,
      projectId: input.projectId,
      name,
      type: input.type,
      color,
      description,
      position,
      createdAt: new Date(),
    });
  } catch (err) {
    if (isUniqueViolation(err)) return DUPLICATE;
    throw err;
  }

  await emitIssueEvent(
    activity(input.projectId, authz.userId, 'workflow_state.created', {
      stateId: id,
      name,
      stateType: input.type,
      summary: `added the ${STATE_TYPE_LABEL[input.type].toLowerCase()} state “${name}”`,
    }),
  );
  revalidate(input.projectId);
  return { ok: true, id };
}

export async function updateWorkflowState(input: {
  projectId: string;
  id: string;
  name?: string;
  color?: string;
  description?: string | null;
}): Promise<WorkflowStateResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'admin');
  if (!authz.ok) return authz;

  const [current] = (await projectStates(input.projectId)).filter((s) => s.id === input.id);
  if (!current) return { ok: false, error: 'State not found.' };

  const changes: { name?: string; color?: string; description?: string | null } = {};
  if (input.name !== undefined) {
    const name = validateName(input.name);
    if (isError(name)) return name;
    if (name !== current.name) {
      if (await nameTaken(input.projectId, name, input.id)) return DUPLICATE;
      changes.name = name;
    }
  }
  if (input.color !== undefined) {
    const color = validateColor(input.color);
    if (isError(color)) return color;
    if (color !== current.color) changes.color = color;
  }
  if (input.description !== undefined) {
    const description = validateDescription(input.description);
    if (isError(description)) return description;
    if (description !== current.description) changes.description = description;
  }
  if (Object.keys(changes).length === 0) return { ok: true, id: current.id };

  try {
    await db
      .update(workflowStates)
      .set(changes)
      .where(
        and(eq(workflowStates.id, current.id), eq(workflowStates.projectId, input.projectId)),
      );
  } catch (err) {
    if (isUniqueViolation(err)) return DUPLICATE;
    throw err;
  }

  await emitIssueEvent(
    activity(input.projectId, authz.userId, 'workflow_state.updated', {
      stateId: current.id,
      name: changes.name ?? current.name,
      changes: Object.keys(changes),
      summary: changes.name
        ? `renamed the state “${current.name}” to “${changes.name}”`
        : `updated the state “${current.name}”`,
    }),
  );
  revalidate(input.projectId);
  return { ok: true, id: current.id };
}

export async function moveWorkflowState(input: {
  projectId: string;
  id: string;
  direction: 'up' | 'down';
}): Promise<WorkflowStateResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'admin');
  if (!authz.ok) return authz;
  if (input.direction !== 'up' && input.direction !== 'down') {
    return { ok: false, error: 'Invalid direction.' };
  }

  const states = await projectStates(input.projectId);
  const state = states.find((s) => s.id === input.id);
  if (!state) return { ok: false, error: 'State not found.' };

  const ordered = states
    .filter((s) => s.type === state.type)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  const from = ordered.findIndex((s) => s.id === state.id);
  const to = input.direction === 'up' ? from - 1 : from + 1;
  if (to < 0 || to >= ordered.length) return { ok: true, id: state.id };
  [ordered[from], ordered[to]] = [ordered[to], ordered[from]];

  const { stored, insert } = prepareIssueEvents([
    activity(input.projectId, authz.userId, 'workflow_state.reordered', {
      stateId: state.id,
      name: state.name,
      summary: `reordered the ${STATE_TYPE_LABEL[state.type].toLowerCase()} states`,
    }),
  ]);
  const updates: BatchItem<'pg'>[] = ordered.map((s, index) =>
    db
      .update(workflowStates)
      .set({ position: index })
      .where(and(eq(workflowStates.id, s.id), eq(workflowStates.projectId, input.projectId))),
  );
  await db.batch([insert, ...updates]);
  publishIssueEvents(stored);

  revalidate(input.projectId);
  return { ok: true, id: state.id };
}

/** Lifecycle timestamp columns for tickets moving from type `from` to `to`. */
function transitionSet(from: StateType, to: StateType, now: Date) {
  if (from === to) return {};
  const keepOrNow: SQL = sql`coalesce(${tickets.startedAt}, ${now})`;
  switch (to) {
    case 'started':
      return { startedAt: keepOrNow, completedAt: null, canceledAt: null };
    case 'completed':
      return { startedAt: keepOrNow, completedAt: now, canceledAt: null };
    case 'canceled':
      return { completedAt: null, canceledAt: now };
    default:
      return { startedAt: null, completedAt: null, canceledAt: null };
  }
}

export async function deleteWorkflowState(input: {
  projectId: string;
  id: string;
  replacementId: string;
}): Promise<WorkflowStateResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'admin');
  if (!authz.ok) return authz;

  const [states, [project]] = await Promise.all([
    projectStates(input.projectId),
    db
      .select({ triageEnabled: projects.triageEnabled })
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .limit(1),
  ]);
  const state = states.find((s) => s.id === input.id);
  if (!state || !project) return { ok: false, error: 'State not found.' };
  const replacement = states.find((s) => s.id === input.replacementId);
  if (!replacement || replacement.id === state.id) {
    return { ok: false, error: 'Pick another state for its issues.', field: 'replacementId' };
  }

  const remainingOfType = states.filter((s) => s.type === state.type && s.id !== state.id);
  if (state.type === 'triage' && project.triageEnabled) {
    return { ok: false, error: 'Turn off triage before deleting the triage state.' };
  }
  if (state.type !== 'triage' && remainingOfType.length === 0) {
    return {
      ok: false,
      error: `Keep at least one ${STATE_TYPE_LABEL[state.type].toLowerCase()} state.`,
    };
  }

  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(tickets)
    .where(and(eq(tickets.projectId, input.projectId), eq(tickets.stateId, state.id)));

  const now = new Date();
  const { stored, insert } = prepareIssueEvents([
    activity(input.projectId, authz.userId, 'workflow_state.deleted', {
      stateId: state.id,
      name: state.name,
      replacementId: replacement.id,
      replacementName: replacement.name,
      movedIssues: count,
      summary:
        count > 0
          ? `deleted the state “${state.name}” and moved ${count} issue${count === 1 ? '' : 's'} to “${replacement.name}”`
          : `deleted the state “${state.name}”`,
    }),
  ]);

  await db.batch([
    db
      .update(tickets)
      .set({
        stateId: replacement.id,
        ...transitionSet(state.type, replacement.type, now),
        updatedAt: now,
      })
      .where(and(eq(tickets.projectId, input.projectId), eq(tickets.stateId, state.id))),
    // The GitHub automation targets are plain ids (no FK) — repoint them too.
    db
      .update(projects)
      .set({ githubPrOpenStateId: replacement.id })
      .where(and(eq(projects.id, input.projectId), eq(projects.githubPrOpenStateId, state.id))),
    db
      .update(projects)
      .set({ githubPrMergeStateId: replacement.id })
      .where(and(eq(projects.id, input.projectId), eq(projects.githubPrMergeStateId, state.id))),
    db
      .delete(workflowStates)
      .where(and(eq(workflowStates.id, state.id), eq(workflowStates.projectId, input.projectId))),
    insert,
  ]);
  publishIssueEvents(stored);

  revalidate(input.projectId);
  return { ok: true };
}
