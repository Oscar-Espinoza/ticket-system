// Project ("team") settings: details, issue key, deletion.
//
// Every action resolves the session and the caller's project role itself —
// the settings UI hiding controls is UX only. Owner/admin may edit details;
// changing the key and deleting are owner-only (they break links for everyone).
// Team structure: parent team (sub-teams) and visibility (private teams)
// are admin settings.

import { redirect } from '@/lib/kit/request';
import { and, eq, sql } from 'drizzle-orm';

import { authorizeProjectAction } from '@/lib/action-auth';
import { db } from '@/lib/db';
import { isUniqueViolation } from '@/lib/db-errors';
import { projectMembers, projects, tickets } from '@/db/schema';
import { isEstimateScale } from '@/lib/estimates';
import type { ProjectRole } from '@/lib/roles';
import { formField as field, refreshesData } from '@/lib/server/action-kit';
import { projectKeyError, projectNameError } from '@/lib/server/project-create';

export type ProjectSettingsState = {
  errors?: {
    name?: string;
    description?: string;
    estimateScale?: string;
    ticketKey?: string;
    parentId?: string;
    visibility?: string;
    confirm?: string;
    server?: string;
  };
  success?: boolean;
};

type Need = 'admin' | 'owner';

/** Session + role gate. Returns the role, or an error state to hand back. */
async function authorize(
  projectId: string,
  need: Need,
): Promise<{ userId: string; role: ProjectRole } | { error: ProjectSettingsState }> {
  const authz = await authorizeProjectAction(projectId, 'admin');
  if (!authz.ok) return { error: { errors: { server: authz.error } } };
  if (need === 'owner' && authz.role !== 'owner') return { error: { errors: { server: 'Forbidden' } } };
  return { userId: authz.userId, role: authz.role };
}

export async function updateProjectDetails(
  _prev: ProjectSettingsState,
  formData: FormData,
): Promise<ProjectSettingsState> {
  const projectId = field(formData, 'projectId');
  const gate = await authorize(projectId, 'admin');
  if ('error' in gate) return gate.error;

  const name = field(formData, 'name');
  const description = field(formData, 'description');
  const estimateScale = field(formData, 'estimateScale');

  const errors: NonNullable<ProjectSettingsState['errors']> = {};
  const nameError = projectNameError(name);
  if (nameError) errors.name = nameError;
  if (description.length > 2000) {
    errors.description = 'Description must be 2000 characters or fewer.';
  }
  if (!isEstimateScale(estimateScale)) errors.estimateScale = 'Pick an estimate scale.';
  if (Object.keys(errors).length > 0) return { errors };

  await db
    .update(projects)
    .set({ name, description: description || null, estimateScale, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  refreshesData();
  return { success: true };
}

export async function changeProjectKey(
  _prev: ProjectSettingsState,
  formData: FormData,
): Promise<ProjectSettingsState> {
  const projectId = field(formData, 'projectId');
  const gate = await authorize(projectId, 'owner');
  if ('error' in gate) return gate.error;

  const ticketKey = field(formData, 'ticketKey');
  const keyError = projectKeyError(ticketKey);
  if (keyError) return { errors: { ticketKey: keyError } };

  // Issue identifiers are derived (`${ticketKey}-${ticketNumber}`), so this one
  // write renames every issue in the project.
  try {
    await db
      .update(projects)
      .set({ ticketKey, updatedAt: new Date() })
      .where(eq(projects.id, projectId));
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { errors: { ticketKey: 'This key is already in use. Choose a different one.' } };
    }
    throw err;
  }

  refreshesData();
  return { success: true };
}

export async function deleteProject(
  _prev: ProjectSettingsState,
  formData: FormData,
): Promise<ProjectSettingsState> {
  const projectId = field(formData, 'projectId');
  const gate = await authorize(projectId, 'owner');
  if ('error' in gate) return gate.error;

  const [project] = await db
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return { errors: { server: 'Project not found.' } };
  // Re-checked here, not just in the dialog, so a replayed request can't skip it.
  if (field(formData, 'confirm') !== project.name) {
    return { errors: { confirm: 'Type the project name exactly to confirm.' } };
  }

  // ticket.state_id is ON DELETE RESTRICT, so letting the project cascade
  // delete tickets and workflow states in one go can trip it depending on
  // cascade order. Tickets go first, in the same batch (one transaction).
  await db.batch([
    db.delete(tickets).where(eq(tickets.projectId, projectId)),
    db.delete(projects).where(eq(projects.id, projectId)),
  ]);

  refreshesData();
  redirect('/dashboard');
}

// ---------------------------------------------------------------------------
// Team structure: parent team + visibility
// ---------------------------------------------------------------------------

// Not exported: every export of an actions module becomes a remote command.
const PROJECT_VISIBILITIES = ['private', 'workspace'] as const;
export type ProjectVisibility = (typeof PROJECT_VISIBILITIES)[number];

/**
 * Sub-teams: the parent must share this project's (non-null) workspace, the
 * caller must be a member of it, and it can't be this project or one of its
 * sub-teams. An empty parentId clears it.
 */
export async function updateProjectParent(
  _prev: ProjectSettingsState,
  formData: FormData,
): Promise<ProjectSettingsState> {
  const projectId = field(formData, 'projectId');
  const gate = await authorize(projectId, 'admin');
  if ('error' in gate) return gate.error;
  const parentId = field(formData, 'parentId') || null;

  if (parentId) {
    if (parentId === projectId) return { errors: { parentId: "A team can't be its own parent." } };
    const [child] = await db
      .select({ workspaceId: projects.workspaceId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    const [parent] = await db
      .select({ workspaceId: projects.workspaceId, role: projectMembers.role })
      .from(projects)
      .innerJoin(
        projectMembers,
        and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, gate.userId)),
      )
      .where(eq(projects.id, parentId))
      .limit(1);
    if (!child?.workspaceId) {
      return { errors: { parentId: 'Add this project to a workspace first.' } };
    }
    if (!parent || parent.workspaceId !== child.workspaceId) {
      return { errors: { parentId: 'Pick a team in the same workspace.' } };
    }
    // Walk up from the candidate parent; meeting this project means a cycle.
    const [cycle] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          sql`${projects.id} in (
            with recursive ancestors(id, parent_id, depth) as (
              select p.id, p.parent_id, 0 from ${projects} p where p.id = ${parentId}
              union all
              select a.id, a.parent_id, ancestors.depth + 1
              from ${projects} a join ancestors on a.id = ancestors.parent_id
              where ancestors.depth < 50
            )
            select id from ancestors
          )`,
        ),
      )
      .limit(1);
    if (cycle) return { errors: { parentId: "A team can't be nested under its own sub-team." } };
  }

  await db
    .update(projects)
    .set({ parentId, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  refreshesData();
  return { success: true };
}

/** Private teams: 'private' (members only) or 'workspace' (discoverable, joinable). */
export async function updateProjectVisibility(
  _prev: ProjectSettingsState,
  formData: FormData,
): Promise<ProjectSettingsState> {
  const projectId = field(formData, 'projectId');
  const gate = await authorize(projectId, 'admin');
  if ('error' in gate) return gate.error;
  const visibility = field(formData, 'visibility');
  if (!(PROJECT_VISIBILITIES as readonly string[]).includes(visibility)) {
    return { errors: { visibility: 'Pick a visibility.' } };
  }

  await db
    .update(projects)
    .set({ visibility, updatedAt: new Date() })
    .where(eq(projects.id, projectId));
  refreshesData();
  return { success: true };
}
