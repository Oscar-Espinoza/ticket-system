// Label mutations (write level). Names are 1–40 chars and unique per project
// (case-insensitively — the DB constraint is case-sensitive, so we pre-check;
// 23505 stays the race backstop). Colors are #rrggbb.

import { and, eq, ne, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { labels } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { isUniqueViolation } from '@/lib/db-errors';
import type { IssueLabel } from '@/lib/issue-model';
import {
  descriptionOrNull,
  fail,
  hexColor,
  isFail,
  refreshesData,
  requiredText,
  type ActionResult,
} from '@/lib/server/action-kit';

export type LabelActionResult = ActionResult<{ label?: IssueLabel }, 'name' | 'color' | 'description'>;

const LABEL_NAME_MAX = 40;
const LABEL_DESCRIPTION_MAX = 200;
const DUPLICATE = fail('A label with this name already exists.', 'name');

async function nameTaken(projectId: string, name: string, exceptId?: string) {
  const [row] = await db
    .select({ id: labels.id })
    .from(labels)
    .where(
      and(
        eq(labels.projectId, projectId),
        sql`lower(${labels.name}) = lower(${name})`,
        exceptId ? ne(labels.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function createLabel(input: {
  projectId: string;
  name: string;
  color: string;
  description?: string | null;
}): Promise<LabelActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;

  const name = requiredText(input.name, 'name', LABEL_NAME_MAX);
  if (isFail(name)) return name;
  const color = hexColor(input.color);
  if (isFail(color)) return color;
  const description = descriptionOrNull(input.description, LABEL_DESCRIPTION_MAX);
  if (isFail(description)) return description;

  if (await nameTaken(input.projectId, name)) return DUPLICATE;
  const label = { id: crypto.randomUUID(), name, color };
  try {
    await db.insert(labels).values({
      ...label,
      projectId: input.projectId,
      description,
      createdAt: new Date(),
    });
  } catch (err) {
    if (isUniqueViolation(err)) return DUPLICATE;
    throw err;
  }
  refreshesData();
  return { ok: true, label };
}

export async function updateLabel(input: {
  projectId: string;
  id: string;
  name?: string;
  color?: string;
  description?: string | null;
}): Promise<LabelActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;

  const changes: { name?: string; color?: string; description?: string | null } = {};
  if (input.name !== undefined) {
    const name = requiredText(input.name, 'name', LABEL_NAME_MAX);
    if (isFail(name)) return name;
    if (await nameTaken(input.projectId, name, input.id)) return DUPLICATE;
    changes.name = name;
  }
  if (input.color !== undefined) {
    const color = hexColor(input.color);
    if (isFail(color)) return color;
    changes.color = color;
  }
  if (input.description !== undefined) {
    const description = descriptionOrNull(input.description, LABEL_DESCRIPTION_MAX);
    if (isFail(description)) return description;
    changes.description = description;
  }
  if (Object.keys(changes).length === 0) return { ok: true };

  let updated;
  try {
    updated = await db
      .update(labels)
      .set(changes)
      .where(and(eq(labels.id, input.id), eq(labels.projectId, input.projectId)))
      .returning({ id: labels.id, name: labels.name, color: labels.color });
  } catch (err) {
    if (isUniqueViolation(err)) return DUPLICATE;
    throw err;
  }
  if (updated.length === 0) return fail('Label not found.');
  refreshesData();
  return { ok: true, label: updated[0] };
}

/** Removes the label from every issue too (issue_label cascades). */
export async function deleteLabel(input: {
  projectId: string;
  id: string;
}): Promise<LabelActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  const deleted = await db
    .delete(labels)
    .where(and(eq(labels.id, input.id), eq(labels.projectId, input.projectId)))
    .returning({ id: labels.id });
  if (deleted.length === 0) return fail('Label not found.');
  refreshesData();
  return { ok: true };
}
