'use server';

// Saved view mutations. Creating needs read access to the project (guests can
// keep personal views); sharing with the project needs write access. Only the
// owner edits or deletes a view, and only while still a project member.

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { favorites, savedViews } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';

export type ViewActionResult =
  | { ok: true; id: string; projectId: string }
  | { ok: false; error: string };

const MAX_JSON = 16_000;
const MAX_NAME = 80;
const MAX_DESCRIPTION = 500;

type Json = Record<string, unknown>;

function isPlainJson(value: unknown): value is Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  try {
    return JSON.stringify(value).length <= MAX_JSON;
  } catch {
    return false;
  }
}

function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().slice(0, MAX_NAME);
  return name || null;
}

function cleanDescription(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.trim().slice(0, MAX_DESCRIPTION) || null;
}

function revalidateViews(projectId: string) {
  revalidatePath('/dashboard/views');
  revalidatePath(`/dashboard/projects/${projectId}/views`, 'layout');
  // Sidebar favorites show view names.
  revalidatePath('/dashboard', 'layout');
}

export async function createView(input: {
  projectId: string;
  name: string;
  description?: string | null;
  shared?: boolean;
  filters: Json;
  display: Json;
}): Promise<ViewActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, input?.shared ? 'write' : 'read');
  if (!authz.ok) {
    return {
      ok: false,
      error: authz.error === 'Forbidden' && input?.shared
        ? 'Only members who can edit issues can share views.'
        : authz.error,
    };
  }
  const name = cleanName(input.name);
  if (!name) return { ok: false, error: 'Give the view a name.' };
  if (!isPlainJson(input.filters) || !isPlainJson(input.display)) {
    return { ok: false, error: 'Invalid view settings.' };
  }

  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(savedViews).values({
    id,
    ownerId: authz.userId,
    projectId: input.projectId,
    name,
    description: cleanDescription(input.description),
    filters: input.filters,
    display: input.display,
    shared: input.shared === true,
    createdAt: now,
    updatedAt: now,
  });
  revalidateViews(input.projectId);
  return { ok: true, id, projectId: input.projectId };
}

/** Loads the view and checks the caller owns it and still belongs to its project. */
async function authorizeOwner(viewId: unknown, level: 'read' | 'write' = 'read') {
  if (typeof viewId !== 'string' || !viewId) return { ok: false as const, error: 'View not found.' };
  const [view] = await db
    .select({ id: savedViews.id, ownerId: savedViews.ownerId, projectId: savedViews.projectId })
    .from(savedViews)
    .where(eq(savedViews.id, viewId))
    .limit(1);
  if (!view?.projectId) return { ok: false as const, error: 'View not found.' };
  const authz = await authorizeProjectAction(view.projectId, level);
  if (!authz.ok) {
    // Don't reveal views of projects the caller can't see.
    return { ok: false as const, error: authz.error === 'Forbidden' ? 'View not found.' : authz.error };
  }
  if (view.ownerId !== authz.userId) {
    return { ok: false as const, error: 'Only the owner can change this view.' };
  }
  return { ok: true as const, view: { id: view.id, projectId: view.projectId }, userId: authz.userId };
}

export async function updateView(input: {
  id: string;
  name?: string;
  description?: string | null;
  shared?: boolean;
  filters?: Json;
  display?: Json;
}): Promise<ViewActionResult> {
  const auth = await authorizeOwner(input?.id, input?.shared ? 'write' : 'read');
  if (!auth.ok) return auth;

  const set: Partial<typeof savedViews.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    const name = cleanName(input.name);
    if (!name) return { ok: false, error: 'Give the view a name.' };
    set.name = name;
  }
  if (input.description !== undefined) set.description = cleanDescription(input.description);
  if (input.shared !== undefined) set.shared = input.shared === true;
  if (input.filters !== undefined) {
    if (!isPlainJson(input.filters)) return { ok: false, error: 'Invalid view settings.' };
    set.filters = input.filters;
  }
  if (input.display !== undefined) {
    if (!isPlainJson(input.display)) return { ok: false, error: 'Invalid view settings.' };
    set.display = input.display;
  }

  await db
    .update(savedViews)
    .set(set)
    .where(and(eq(savedViews.id, auth.view.id), eq(savedViews.ownerId, auth.userId)));
  revalidateViews(auth.view.projectId);
  return { ok: true, id: auth.view.id, projectId: auth.view.projectId };
}

export async function deleteView(input: { id: string }): Promise<ViewActionResult> {
  const auth = await authorizeOwner(input?.id);
  if (!auth.ok) return auth;
  await db.batch([
    db
      .delete(savedViews)
      .where(and(eq(savedViews.id, auth.view.id), eq(savedViews.ownerId, auth.userId))),
    // Everyone's stars on it would otherwise linger (the sidebar skips them anyway).
    db
      .delete(favorites)
      .where(and(eq(favorites.targetType, 'view'), eq(favorites.targetId, auth.view.id))),
  ]);
  revalidateViews(auth.view.projectId);
  return { ok: true, id: auth.view.id, projectId: auth.view.projectId };
}
