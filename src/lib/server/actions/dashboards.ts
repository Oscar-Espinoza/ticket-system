// Dashboard mutations. Anyone signed in can keep personal cross-project
// dashboards; a project-scoped one needs membership (read), sharing it with
// the project needs write access. Only the owner edits or deletes; anyone who
// can see a dashboard can duplicate it into their own.

import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { dashboards, projectMembers } from '@/db/schema';
import {
  MAX_WIDGETS,
  normalizeWidgets,
  starterWidgets,
  type Widget,
} from '@/lib/widget-model';
import { authorizeProjectAction } from '@/lib/action-auth';
import { getDashboardForViewer } from '@/lib/dashboards';
import {
  fail,
  NOT_AUTHENTICATED,
  refreshesData,
  type ActionResult,
} from '@/lib/server/action-kit';
import { sessionUserId } from '@/lib/session';
import { clippedText } from '@/lib/text';

export type DashboardActionResult = ActionResult<{ id: string }>;

const MAX_NAME = 80;
const MAX_DESCRIPTION = 500;
const MAX_JSON = 32_000;

/**
 * Normalised widgets whose project references stay inside the dashboard's
 * scope: its project, or (cross-project) projects the owner belongs to.
 */
async function validWidgets(
  raw: unknown,
  scopeProjectId: string | null,
  userId: string,
): Promise<ActionResult<{ widgets: Widget[] }>> {
  if (!Array.isArray(raw) || raw.length > MAX_WIDGETS) {
    return fail(`A dashboard holds up to ${MAX_WIDGETS} widgets.`);
  }
  let size = 0;
  try {
    size = JSON.stringify(raw).length;
  } catch {
    return fail('Invalid widgets.');
  }
  if (size > MAX_JSON) return fail('These widgets are too large to save.');

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
    if (referenced.some((id) => !allowed.has(id))) return fail('Unknown project in a widget.');
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
    if (!authz.ok) return authz;
    userId = authz.userId;
  } else {
    userId = await sessionUserId();
    if (!userId) return NOT_AUTHENTICATED;
  }
  const name = clippedText(input?.name, MAX_NAME);
  if (!name) return fail('Give the dashboard a name.');

  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(dashboards).values({
    id,
    ownerId: userId,
    projectId,
    name,
    description: clippedText(input?.description, MAX_DESCRIPTION),
    shared: false,
    widgets: starterWidgets() as unknown as Record<string, unknown>[],
    createdAt: now,
    updatedAt: now,
  });
  refreshesData();
  return { ok: true, id };
}

/** Loads the dashboard and checks the caller owns it (and can still see it). */
async function authorizeOwner(dashboardId: unknown) {
  const userId = await sessionUserId();
  if (!userId) return NOT_AUTHENTICATED;
  if (typeof dashboardId !== 'string' || !dashboardId) return fail('Dashboard not found.');
  const dashboard = await getDashboardForViewer(dashboardId, userId);
  if (!dashboard) return fail('Dashboard not found.');
  if (dashboard.ownerId !== userId) {
    return fail('Only the owner can change this dashboard.');
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
    const name = clippedText(input.name, MAX_NAME);
    if (!name) return fail('Give the dashboard a name.');
    set.name = name;
  }
  if (input.description !== undefined) set.description = clippedText(input.description, MAX_DESCRIPTION);
  if (input.shared !== undefined) {
    if (input.shared === true) {
      if (!dashboard.projectId) {
        return fail('Only project dashboards can be shared.');
      }
      const authz = await authorizeProjectAction(dashboard.projectId, 'write');
      if (!authz.ok) return fail('Only members who can edit issues can share dashboards.');
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
  refreshesData();
  return { ok: true, id: dashboard.id };
}

export async function deleteDashboard(input: { id: string }): Promise<DashboardActionResult> {
  const auth = await authorizeOwner(input?.id);
  if (!auth.ok) return auth;
  await db
    .delete(dashboards)
    .where(and(eq(dashboards.id, auth.dashboard.id), eq(dashboards.ownerId, auth.userId)));
  refreshesData();
  return { ok: true, id: auth.dashboard.id };
}

/** A private copy for the caller (any dashboard they can see). */
export async function duplicateDashboard(input: { id: string }): Promise<DashboardActionResult> {
  const userId = await sessionUserId();
  if (!userId) return NOT_AUTHENTICATED;
  if (typeof input?.id !== 'string' || !input.id) return fail('Dashboard not found.');
  const source = await getDashboardForViewer(input.id, userId);
  if (!source) return fail('Dashboard not found.');

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
  refreshesData();
  return { ok: true, id };
}
