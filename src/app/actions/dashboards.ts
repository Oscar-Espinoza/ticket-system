'use server';

// Dashboard mutations. Anyone signed in can keep personal cross-project
// dashboards; a project-scoped one needs membership (read), sharing it with
// the project needs write access. Only the owner edits or deletes; anyone who
// can see a dashboard can duplicate it into their own.

import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { dashboards, projectMembers } from '@/db/schema';
import {
  MAX_WIDGETS,
  normalizeWidgets,
  starterWidgets,
  type Widget,
} from '@/components/dashboards/widget-model';
import { authorizeProjectAction } from '@/lib/action-auth';
import { getDashboardForViewer } from '@/lib/dashboards';
import { getSession } from '@/lib/session';

export type DashboardActionResult = { ok: true; id: string } | { ok: false; error: string };

const MAX_NAME = 80;
const MAX_DESCRIPTION = 500;
const MAX_JSON = 32_000;

function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.trim().slice(0, MAX_NAME) || null;
}

function cleanDescription(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.trim().slice(0, MAX_DESCRIPTION) || null;
}

function revalidateDashboards(id?: string) {
  revalidatePath('/dashboard/dashboards');
  if (id) revalidatePath(`/dashboard/dashboards/${id}`);
}

async function sessionUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user?.id ?? null;
}

/**
 * Normalised widgets whose project references stay inside the dashboard's
 * scope: its project, or (cross-project) projects the owner belongs to.
 */
async function validWidgets(
  raw: unknown,
  scopeProjectId: string | null,
  userId: string,
): Promise<{ ok: true; widgets: Widget[] } | { ok: false; error: string }> {
  if (!Array.isArray(raw) || raw.length > MAX_WIDGETS) {
    return { ok: false, error: `A dashboard holds up to ${MAX_WIDGETS} widgets.` };
  }
  let size = 0;
  try {
    size = JSON.stringify(raw).length;
  } catch {
    return { ok: false, error: 'Invalid widgets.' };
  }
  if (size > MAX_JSON) return { ok: false, error: 'These widgets are too large to save.' };

  const widgets = normalizeWidgets(raw);
  const referenced = [...new Set(widgets.map((w) => w.config.projectId).filter((id): id is string => !!id))];
  if (scopeProjectId) {
    // Inside a project dashboard every widget uses that project.
    for (const widget of widgets) widget.config.projectId = null;
  } else if (referenced.length) {
    const rows = await db
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(and(eq(projectMembers.userId, userId), inArray(projectMembers.projectId, referenced)));
    const allowed = new Set(rows.map((r) => r.projectId));
    if (referenced.some((id) => !allowed.has(id))) return { ok: false, error: 'Unknown project in a widget.' };
  }
  return { ok: true, widgets };
}

export async function createDashboard(input: {
  name: string;
  description?: string | null;
  projectId?: string | null;
}): Promise<DashboardActionResult> {
  const projectId = input?.projectId || null;
  let userId: string | null;
  if (projectId) {
    const authz = await authorizeProjectAction(projectId, 'read');
    if (!authz.ok) return { ok: false, error: authz.error };
    userId = authz.userId;
  } else {
    userId = await sessionUserId();
    if (!userId) return { ok: false, error: 'Not authenticated' };
  }
  const name = cleanName(input?.name);
  if (!name) return { ok: false, error: 'Give the dashboard a name.' };

  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(dashboards).values({
    id,
    ownerId: userId,
    projectId,
    name,
    description: cleanDescription(input?.description),
    shared: false,
    widgets: starterWidgets() as unknown as Record<string, unknown>[],
    createdAt: now,
    updatedAt: now,
  });
  revalidateDashboards();
  return { ok: true, id };
}

/** Loads the dashboard and checks the caller owns it (and can still see it). */
async function authorizeOwner(dashboardId: unknown) {
  const userId = await sessionUserId();
  if (!userId) return { ok: false as const, error: 'Not authenticated' };
  if (typeof dashboardId !== 'string' || !dashboardId) return { ok: false as const, error: 'Dashboard not found.' };
  const dashboard = await getDashboardForViewer(dashboardId, userId);
  if (!dashboard) return { ok: false as const, error: 'Dashboard not found.' };
  if (dashboard.ownerId !== userId) {
    return { ok: false as const, error: 'Only the owner can change this dashboard.' };
  }
  return { ok: true as const, dashboard, userId };
}

export async function updateDashboard(input: {
  id: string;
  name?: string;
  description?: string | null;
  shared?: boolean;
  widgets?: unknown;
}): Promise<DashboardActionResult> {
  const auth = await authorizeOwner(input?.id);
  if (!auth.ok) return auth;
  const { dashboard, userId } = auth;

  const set: Partial<typeof dashboards.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    const name = cleanName(input.name);
    if (!name) return { ok: false, error: 'Give the dashboard a name.' };
    set.name = name;
  }
  if (input.description !== undefined) set.description = cleanDescription(input.description);
  if (input.shared !== undefined) {
    if (input.shared === true) {
      if (!dashboard.projectId) {
        return { ok: false, error: 'Only project dashboards can be shared.' };
      }
      const authz = await authorizeProjectAction(dashboard.projectId, 'write');
      if (!authz.ok) return { ok: false, error: 'Only members who can edit issues can share dashboards.' };
    }
    set.shared = input.shared === true;
  }
  if (input.widgets !== undefined) {
    const result = await validWidgets(input.widgets, dashboard.projectId, userId);
    if (!result.ok) return result;
    set.widgets = result.widgets as unknown as Record<string, unknown>[];
  }

  await db
    .update(dashboards)
    .set(set)
    .where(and(eq(dashboards.id, dashboard.id), eq(dashboards.ownerId, userId)));
  revalidateDashboards(dashboard.id);
  return { ok: true, id: dashboard.id };
}

export async function deleteDashboard(input: { id: string }): Promise<DashboardActionResult> {
  const auth = await authorizeOwner(input?.id);
  if (!auth.ok) return auth;
  await db
    .delete(dashboards)
    .where(and(eq(dashboards.id, auth.dashboard.id), eq(dashboards.ownerId, auth.userId)));
  revalidateDashboards(auth.dashboard.id);
  return { ok: true, id: auth.dashboard.id };
}

/** A private copy for the caller (any dashboard they can see). */
export async function duplicateDashboard(input: { id: string }): Promise<DashboardActionResult> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: 'Not authenticated' };
  if (typeof input?.id !== 'string' || !input.id) return { ok: false, error: 'Dashboard not found.' };
  const source = await getDashboardForViewer(input.id, userId);
  if (!source) return { ok: false, error: 'Dashboard not found.' };

  // A copied cross-project dashboard may point at projects the caller isn't in.
  const result = await validWidgets(source.widgets, source.projectId, userId);
  const widgets = result.ok
    ? result.widgets
    : source.widgets.map((w) => ({ ...w, config: { ...w.config, projectId: null } }));

  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(dashboards).values({
    id,
    ownerId: userId,
    projectId: source.projectId,
    name: `${source.name} (copy)`.slice(0, MAX_NAME),
    description: source.description,
    shared: false,
    widgets: normalizeWidgets(widgets) as unknown as Record<string, unknown>[],
    createdAt: now,
    updatedAt: now,
  });
  revalidateDashboards();
  return { ok: true, id };
}
