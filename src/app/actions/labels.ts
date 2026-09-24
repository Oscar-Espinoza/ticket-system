'use server';

// Label mutations (write level). Names are 1–40 chars and unique per project
// (case-insensitively — the DB constraint is case-sensitive, so we pre-check;
// 23505 stays the race backstop). Colors are #rrggbb.

import { revalidatePath } from 'next/cache';
import { and, eq, ne, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { labels } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import type { IssueLabel } from '@/lib/issue-model';

export type LabelActionResult =
  | { ok: true; label?: IssueLabel }
  | { ok: false; error: string; field?: 'name' | 'color' | 'description' };

const LABEL_NAME_MAX = 40;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const DUPLICATE: LabelActionResult = {
  ok: false,
  error: 'A label with this name already exists.',
  field: 'name',
};

function validateName(name: unknown): string | LabelActionResult {
  const value = typeof name === 'string' ? name.trim() : '';
  if (!value) return { ok: false, error: 'Name is required.', field: 'name' };
  if (value.length > LABEL_NAME_MAX) {
    return { ok: false, error: `Name must be ${LABEL_NAME_MAX} characters or fewer.`, field: 'name' };
  }
  return value;
}

function validateColor(color: unknown): string | LabelActionResult {
  if (typeof color !== 'string' || !COLOR_RE.test(color)) {
    return { ok: false, error: 'Color must be a hex value like #5e6ad2.', field: 'color' };
  }
  return color.toLowerCase();
}

function validateDescription(description: unknown): string | null | LabelActionResult {
  if (description == null) return null;
  if (typeof description !== 'string' || description.length > 200) {
    return { ok: false, error: 'Description must be 200 characters or fewer.', field: 'description' };
  }
  return description.trim() || null;
}

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

function isUniqueViolation(err: unknown) {
  const code =
    (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === '23505';
}

function revalidate(projectId: string) {
  revalidatePath(`/dashboard/projects/${projectId}`, 'layout');
}

export async function createLabel(input: {
  projectId: string;
  name: string;
  color: string;
  description?: string | null;
}): Promise<LabelActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;

  const name = validateName(input.name);
  if (typeof name !== 'string') return name;
  const color = validateColor(input.color);
  if (typeof color !== 'string') return color;
  const description = validateDescription(input.description);
  if (description !== null && typeof description !== 'string') return description;

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
  revalidate(input.projectId);
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
    const name = validateName(input.name);
    if (typeof name !== 'string') return name;
    if (await nameTaken(input.projectId, name, input.id)) return DUPLICATE;
    changes.name = name;
  }
  if (input.color !== undefined) {
    const color = validateColor(input.color);
    if (typeof color !== 'string') return color;
    changes.color = color;
  }
  if (input.description !== undefined) {
    const description = validateDescription(input.description);
    if (description !== null && typeof description !== 'string') return description;
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
  if (updated.length === 0) return { ok: false, error: 'Label not found.' };
  revalidate(input.projectId);
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
  if (deleted.length === 0) return { ok: false, error: 'Label not found.' };
  revalidate(input.projectId);
  return { ok: true };
}
