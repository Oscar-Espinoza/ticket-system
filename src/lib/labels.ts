// Project labels: the writes and the one dedupe rule — a label name is unique
// per project, case-insensitively. The DB constraint is case-sensitive, so
// writers pre-check (labelNameTaken / the lowercase map of ensureLabels) and
// treat 23505 as the race backstop. Server-only; callers authorize first.

import { and, eq, ne, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { isUniqueViolation } from '@/lib/db-errors';
import { labels } from '@/db/schema';
import type { IssueLabel } from '@/lib/issue-model';

export type LabelFields = { name?: string; color?: string; description?: string | null };
export type LabelWrite = { ok: true; label: IssueLabel } | { ok: false; reason: 'duplicate' | 'not-found' };

/** Another label of the project already has this name (ignoring case); `exceptId` is the label being renamed. */
export async function labelNameTaken(projectId: string, name: string, exceptId?: string) {
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

export async function createLabel(
  projectId: string,
  fields: { name: string; color: string; description: string | null },
): Promise<LabelWrite> {
  if (await labelNameTaken(projectId, fields.name)) return { ok: false, reason: 'duplicate' };
  const label = { id: crypto.randomUUID(), name: fields.name, color: fields.color };
  try {
    await db.insert(labels).values({
      ...label,
      projectId,
      description: fields.description,
      createdAt: new Date(),
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: 'duplicate' };
    throw err;
  }
  return { ok: true, label };
}

/** Applies `changes` (a renamed label must have passed `labelNameTaken`; 23505 covers the race). */
export async function updateLabel(
  projectId: string,
  id: string,
  changes: LabelFields,
): Promise<LabelWrite> {
  let updated;
  try {
    updated = await db
      .update(labels)
      .set(changes)
      .where(and(eq(labels.id, id), eq(labels.projectId, projectId)))
      .returning({ id: labels.id, name: labels.name, color: labels.color });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: 'duplicate' };
    throw err;
  }
  return updated.length ? { ok: true, label: updated[0] } : { ok: false, reason: 'not-found' };
}

/** Removes the label from every issue too (issue_label cascades). False when it doesn't exist. */
export async function deleteLabel(projectId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(labels)
    .where(and(eq(labels.id, id), eq(labels.projectId, projectId)))
    .returning({ id: labels.id });
  return deleted.length > 0;
}

/** Colors handed to labels created without one, in turn. */
const DEFAULT_COLORS = ['#5e6ad2', '#26b5ce', '#4cb782', '#f2c94c', '#f2994a', '#eb5757', '#bb87fc', '#95a2b3'];

/**
 * Label ids by lowercase name for every wanted label: the project's existing
 * ones (`existing`) are reused, the missing ones are created in one insert (a
 * concurrent writer's identical names are skipped, then picked up by the
 * re-read). `created` counts the labels this call tried to add.
 */
export async function ensureLabels(
  projectId: string,
  existing: { id: string; name: string }[],
  wanted: { name: string; color?: string | null }[],
): Promise<{ ids: Map<string, string>; created: number }> {
  const ids = new Map(existing.map((l) => [l.name.toLowerCase(), l.id]));
  const missing = new Map<string, { name: string; color?: string | null }>();
  for (const label of wanted) {
    const key = label.name.toLowerCase();
    if (!ids.has(key) && !missing.has(key)) missing.set(key, label);
  }
  if (!missing.size) return { ids, created: 0 };

  const now = new Date();
  await db
    .insert(labels)
    .values(
      [...missing.values()].map((label, i) => ({
        id: crypto.randomUUID(),
        projectId,
        name: label.name,
        color: label.color ?? DEFAULT_COLORS[(ids.size + i) % DEFAULT_COLORS.length],
        createdAt: now,
      })),
    )
    .onConflictDoNothing();
  // Re-read so labels a concurrent writer just created resolve too.
  const fresh = await db
    .select({ id: labels.id, name: labels.name })
    .from(labels)
    .where(eq(labels.projectId, projectId));
  for (const l of fresh) ids.set(l.name.toLowerCase(), l.id);
  return { ids, created: missing.size };
}
