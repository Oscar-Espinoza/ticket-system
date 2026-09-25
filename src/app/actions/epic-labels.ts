'use server';

// Epic ("project") labels: project-scoped tags for epics, separate from issue
// labels. Write level. Names are 1–40 chars, unique per project
// case-insensitively (pre-check; 23505 is the race backstop). Every write is
// scoped by projectId, and label ids assigned to an epic must be the
// project's own — ids from another project match nothing.

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { epicLabelLinks, epicLabels, epics } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { emitIssueEvent } from '@/lib/events';
import {
  EPIC_LABELS_MAX,
  EPIC_LABEL_NAME_MAX,
  type EpicLabelRow,
} from '@/components/epics/epic-model';

export type EpicLabelActionResult =
  | { ok: true; label?: EpicLabelRow }
  | { ok: false; error: string; field?: 'name' | 'color' };

type Fail = Extract<EpicLabelActionResult, { ok: false }>;

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const DUPLICATE: Fail = { ok: false, error: 'A label with this name already exists.', field: 'name' };

function validateName(value: unknown): string | Fail {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) return { ok: false, error: 'Name is required.', field: 'name' };
  if (name.length > EPIC_LABEL_NAME_MAX) {
    return { ok: false, error: `Name must be ${EPIC_LABEL_NAME_MAX} characters or fewer.`, field: 'name' };
  }
  return name;
}

function validateColor(value: unknown): string | Fail {
  if (typeof value !== 'string' || !COLOR_RE.test(value)) {
    return { ok: false, error: 'Color must be a hex value like #5e6ad2.', field: 'color' };
  }
  return value.toLowerCase();
}

async function nameTaken(projectId: string, name: string, exceptId?: string) {
  const [row] = await db
    .select({ id: epicLabels.id })
    .from(epicLabels)
    .where(
      and(
        eq(epicLabels.projectId, projectId),
        sql`lower(${epicLabels.name}) = lower(${name})`,
        exceptId ? ne(epicLabels.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  return Boolean(row);
}

function isUniqueViolation(err: unknown) {
  const code =
    (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === '23505';
}

async function loadLabel(projectId: string, id: unknown) {
  if (typeof id !== 'string' || !id) return null;
  const [label] = await db
    .select({ id: epicLabels.id, name: epicLabels.name, color: epicLabels.color })
    .from(epicLabels)
    .where(and(eq(epicLabels.id, id), eq(epicLabels.projectId, projectId)))
    .limit(1);
  return label ?? null;
}

function revalidate(projectId: string) {
  revalidatePath(`/dashboard/projects/${projectId}`, 'layout');
}

export async function createEpicLabel(input: {
  projectId: string;
  name: string;
  color: string;
}): Promise<EpicLabelActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const name = validateName(input.name);
  if (typeof name !== 'string') return name;
  const color = validateColor(input.color);
  if (typeof color !== 'string') return color;

  if (await nameTaken(input.projectId, name)) return DUPLICATE;
  const label: EpicLabelRow = { id: crypto.randomUUID(), name, color };
  try {
    await db.insert(epicLabels).values({ ...label, projectId: input.projectId, createdAt: new Date() });
  } catch (err) {
    if (isUniqueViolation(err)) return DUPLICATE;
    throw err;
  }
  await emitIssueEvent([
    {
      projectId: input.projectId,
      ticketId: null,
      actorId: authz.userId,
      type: 'epic_label.created',
      data: { summary: `created epic label ${name}`, labelId: label.id, name },
    },
  ]);
  revalidate(input.projectId);
  return { ok: true, label };
}

export async function updateEpicLabel(input: {
  projectId: string;
  id: string;
  name?: string;
  color?: string;
}): Promise<EpicLabelActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const label = await loadLabel(input.projectId, input.id);
  if (!label) return { ok: false, error: 'Label not found.' };

  const changes: { name?: string; color?: string } = {};
  if (input.name !== undefined) {
    const name = validateName(input.name);
    if (typeof name !== 'string') return name;
    if (name !== label.name) {
      if (await nameTaken(input.projectId, name, label.id)) return DUPLICATE;
      changes.name = name;
    }
  }
  if (input.color !== undefined) {
    const color = validateColor(input.color);
    if (typeof color !== 'string') return color;
    if (color !== label.color) changes.color = color;
  }
  if (Object.keys(changes).length === 0) return { ok: true, label };

  try {
    await db
      .update(epicLabels)
      .set(changes)
      .where(and(eq(epicLabels.id, label.id), eq(epicLabels.projectId, input.projectId)));
  } catch (err) {
    if (isUniqueViolation(err)) return DUPLICATE;
    throw err;
  }
  const next = { ...label, ...changes };
  await emitIssueEvent([
    {
      projectId: input.projectId,
      ticketId: null,
      actorId: authz.userId,
      type: 'epic_label.updated',
      data: {
        summary: changes.name
          ? `renamed epic label ${label.name} to ${changes.name}`
          : `changed the color of epic label ${label.name}`,
        labelId: label.id,
        name: next.name,
      },
    },
  ]);
  revalidate(input.projectId);
  return { ok: true, label: next };
}

/** Removes the label from every epic (links cascade). */
export async function deleteEpicLabel(input: {
  projectId: string;
  id: string;
}): Promise<EpicLabelActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const label = await loadLabel(input.projectId, input.id);
  if (!label) return { ok: false, error: 'Label not found.' };

  await db
    .delete(epicLabels)
    .where(and(eq(epicLabels.id, label.id), eq(epicLabels.projectId, input.projectId)));
  await emitIssueEvent([
    {
      projectId: input.projectId,
      ticketId: null,
      actorId: authz.userId,
      type: 'epic_label.deleted',
      data: { summary: `deleted epic label ${label.name}`, labelId: label.id, name: label.name },
    },
  ]);
  revalidate(input.projectId);
  return { ok: true };
}

/** Full replacement of the epic's labels. */
export async function setEpicLabels(input: {
  projectId: string;
  epicId: string;
  labelIds: string[];
}): Promise<EpicLabelActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const { projectId } = input;
  if (
    !Array.isArray(input.labelIds) ||
    input.labelIds.some((id) => typeof id !== 'string' || !id)
  ) {
    return { ok: false, error: 'Invalid labels.' };
  }
  const wanted = [...new Set(input.labelIds)];
  if (wanted.length > EPIC_LABELS_MAX) {
    return { ok: false, error: `An epic can have at most ${EPIC_LABELS_MAX} labels.` };
  }

  const epicId = typeof input.epicId === 'string' ? input.epicId : '';

  const [[epic], found, current] = await db.batch([
    db
      .select({ id: epics.id, name: epics.name })
      .from(epics)
      .where(and(eq(epics.id, epicId), eq(epics.projectId, projectId)))
      .limit(1),
    db
      .select({ id: epicLabels.id, name: epicLabels.name })
      .from(epicLabels)
      .where(
        and(
          eq(epicLabels.projectId, projectId),
          wanted.length ? inArray(epicLabels.id, wanted) : sql`false`,
        ),
      ),
    db
      .select({ labelId: epicLabelLinks.labelId, name: epicLabels.name })
      .from(epicLabelLinks)
      .innerJoin(epicLabels, eq(epicLabelLinks.labelId, epicLabels.id))
      .where(and(eq(epicLabelLinks.epicId, epicId), eq(epicLabels.projectId, projectId))),
  ]);
  if (!epic) return { ok: false, error: 'Epic not found.' };
  if (found.length !== wanted.length) {
    return { ok: false, error: 'One of the labels no longer exists — refresh and try again.' };
  }

  const before = new Set(current.map((l) => l.labelId));
  const added = found.filter((l) => !before.has(l.id));
  const removed = current.filter((l) => !wanted.includes(l.labelId));
  if (added.length === 0 && removed.length === 0) return { ok: true };

  const clear = db.delete(epicLabelLinks).where(eq(epicLabelLinks.epicId, epic.id));
  if (wanted.length) {
    await db.batch([
      clear,
      db.insert(epicLabelLinks).values(wanted.map((labelId) => ({ epicId: epic.id, labelId }))),
    ]);
  } else {
    await clear;
  }

  const names = (list: { name: string }[]) => list.map((l) => l.name).join(', ');
  const summary =
    added.length && !removed.length
      ? `added ${added.length > 1 ? 'labels' : 'label'} ${names(added)} to epic ${epic.name}`
      : removed.length && !added.length
        ? `removed ${removed.length > 1 ? 'labels' : 'label'} ${names(removed)} from epic ${epic.name}`
        : `changed the labels of epic ${epic.name}`;
  await emitIssueEvent([
    {
      projectId,
      ticketId: null,
      actorId: authz.userId,
      type: 'epic.labels_changed',
      data: {
        summary,
        epicId: epic.id,
        epicName: epic.name,
        added: added.map((l) => ({ id: l.id, name: l.name })),
        removed: removed.map((l) => ({ id: l.labelId, name: l.name })),
      },
    },
  ]);
  revalidate(projectId);
  return { ok: true };
}
