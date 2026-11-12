// Epic ("project") labels: project-scoped tags for epics, separate from issue
// labels. Write level. Names are 1–40 chars, unique per project
// case-insensitively (pre-check; 23505 is the race backstop). Every write is
// scoped by projectId, and label ids assigned to an epic must be the
// project's own — ids from another project match nothing.

import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';

import { db } from '@/lib/db';
import { epicLabelLinks, epicLabels, epics } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { isUniqueViolation } from '@/lib/db-errors';
import { commitWithEvents } from '@/lib/events';
import {
  fail,
  hexColor,
  isFail,
  refreshesData,
  requiredText,
  type ActionResult,
} from '@/lib/server/action-kit';
import {
  EPIC_LABELS_MAX,
  EPIC_LABEL_NAME_MAX,
  type EpicLabelRow,
} from '@/lib/epic-model';

export type EpicLabelActionResult = ActionResult<{ label?: EpicLabelRow }, 'name' | 'color'>;

const DUPLICATE = fail('A label with this name already exists.', 'name');

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

async function loadLabel(projectId: string, id: unknown) {
  if (typeof id !== 'string' || !id) return null;
  const [label] = await db
    .select({ id: epicLabels.id, name: epicLabels.name, color: epicLabels.color })
    .from(epicLabels)
    .where(and(eq(epicLabels.id, id), eq(epicLabels.projectId, projectId)))
    .limit(1);
  return label ?? null;
}

export async function createEpicLabel(input: {
  projectId: string;
  name: string;
  color: string;
}): Promise<EpicLabelActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const name = requiredText(input.name, 'name', EPIC_LABEL_NAME_MAX);
  if (isFail(name)) return name;
  const color = hexColor(input.color);
  if (isFail(color)) return color;

  if (await nameTaken(input.projectId, name)) return DUPLICATE;
  const label: EpicLabelRow = { id: crypto.randomUUID(), name, color };
  try {
    await commitWithEvents(
      [db.insert(epicLabels).values({ ...label, projectId: input.projectId, createdAt: new Date() })],
      [
        {
          projectId: input.projectId,
          ticketId: null,
          actorId: authz.userId,
          type: 'epic_label.created',
          data: { summary: `created epic label ${name}`, labelId: label.id, name },
        },
      ],
    );
  } catch (err) {
    if (isUniqueViolation(err)) return DUPLICATE;
    throw err;
  }
  refreshesData();
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
  if (!label) return fail('Label not found.');

  const changes: { name?: string; color?: string } = {};
  if (input.name !== undefined) {
    const name = requiredText(input.name, 'name', EPIC_LABEL_NAME_MAX);
    if (isFail(name)) return name;
    if (name !== label.name) {
      if (await nameTaken(input.projectId, name, label.id)) return DUPLICATE;
      changes.name = name;
    }
  }
  if (input.color !== undefined) {
    const color = hexColor(input.color);
    if (isFail(color)) return color;
    if (color !== label.color) changes.color = color;
  }
  if (Object.keys(changes).length === 0) return { ok: true, label };

  const next = { ...label, ...changes };
  try {
    await commitWithEvents(
      [
        db
          .update(epicLabels)
          .set(changes)
          .where(and(eq(epicLabels.id, label.id), eq(epicLabels.projectId, input.projectId))),
      ],
      [
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
      ],
    );
  } catch (err) {
    if (isUniqueViolation(err)) return DUPLICATE;
    throw err;
  }
  refreshesData();
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
  if (!label) return fail('Label not found.');

  await commitWithEvents(
    [db.delete(epicLabels).where(and(eq(epicLabels.id, label.id), eq(epicLabels.projectId, input.projectId)))],
    [
      {
        projectId: input.projectId,
        ticketId: null,
        actorId: authz.userId,
        type: 'epic_label.deleted',
        data: { summary: `deleted epic label ${label.name}`, labelId: label.id, name: label.name },
      },
    ],
  );
  refreshesData();
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
    return fail('Invalid labels.');
  }
  const wanted = [...new Set(input.labelIds)];
  if (wanted.length > EPIC_LABELS_MAX) {
    return fail(`An epic can have at most ${EPIC_LABELS_MAX} labels.`);
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
  if (!epic) return fail('Epic not found.');
  if (found.length !== wanted.length) {
    return fail('One of the labels no longer exists — refresh and try again.');
  }

  const before = new Set(current.map((l) => l.labelId));
  const added = found.filter((l) => !before.has(l.id));
  const removed = current.filter((l) => !wanted.includes(l.labelId));
  if (added.length === 0 && removed.length === 0) return { ok: true };

  const writes: BatchItem<'pg'>[] = [db.delete(epicLabelLinks).where(eq(epicLabelLinks.epicId, epic.id))];
  if (wanted.length) {
    writes.push(db.insert(epicLabelLinks).values(wanted.map((labelId) => ({ epicId: epic.id, labelId }))));
  }

  const names = (list: { name: string }[]) => list.map((l) => l.name).join(', ');
  const summary =
    added.length && !removed.length
      ? `added ${added.length > 1 ? 'labels' : 'label'} ${names(added)} to epic ${epic.name}`
      : removed.length && !added.length
        ? `removed ${removed.length > 1 ? 'labels' : 'label'} ${names(removed)} from epic ${epic.name}`
        : `changed the labels of epic ${epic.name}`;
  await commitWithEvents(writes, [
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
  refreshesData();
  return { ok: true };
}
