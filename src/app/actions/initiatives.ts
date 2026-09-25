'use server';

// Initiative mutations. Initiatives belong to a workspace, so these authorize
// with requireWorkspaceMember (delete: workspace admin or the initiative's
// owner). Linking an epic also needs write access to the epic's project, and
// the project must sit in the initiative's workspace.

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { epics, initiatives, projects, workspaceMembers, workspaces } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { isDateString } from '@/lib/dates';
import { getSession } from '@/lib/session';
import {
  WorkspaceAccessError,
  requireWorkspaceMember,
  type WorkspaceMembership,
} from '@/lib/workspace-access';
import { EPIC_DESCRIPTION_MAX } from '@/components/epics/epic-model';
import {
  INITIATIVE_NAME_MAX,
  isInitiativeStatus,
  type InitiativeStatus,
} from '@/components/initiatives/initiative-model';

export type InitiativeActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; field?: string };

type Fail = Extract<InitiativeActionResult, { ok: false }>;
const fail = (error: string, field?: string): Fail => ({ ok: false, error, field });

async function authorizeWorkspace(
  workspaceId: unknown,
): Promise<{ ok: true; membership: WorkspaceMembership } | Fail> {
  const session = await getSession();
  if (!session?.user) return fail('Not authenticated');
  if (typeof workspaceId !== 'string' || !workspaceId) return fail('Forbidden');
  try {
    return { ok: true, membership: await requireWorkspaceMember(workspaceId, session.user.id) };
  } catch (err) {
    if (err instanceof WorkspaceAccessError) return fail('Forbidden');
    throw err;
  }
}

function revalidateWorkspace(slug: string) {
  revalidatePath(`/dashboard/workspaces/${slug}`, 'layout');
}

async function isWorkspaceMember(workspaceId: string, userId: string) {
  const [row] = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return Boolean(row);
}

export interface InitiativeInput {
  name?: string;
  description?: string | null;
  status?: InitiativeStatus;
  ownerId?: string | null;
  targetDate?: string | null;
}

type InitiativeChanges = Partial<{
  name: string;
  description: string | null;
  status: InitiativeStatus;
  ownerId: string | null;
  targetDate: string | null;
}>;

async function validate(
  workspaceId: string,
  input: InitiativeInput,
): Promise<InitiativeChanges | Fail> {
  const changes: InitiativeChanges = {};
  if (input.name !== undefined) {
    const value = typeof input.name === 'string' ? input.name.trim() : '';
    if (!value) return fail('Name is required.', 'name');
    if (value.length > INITIATIVE_NAME_MAX) {
      return fail(`Name must be ${INITIATIVE_NAME_MAX} characters or fewer.`, 'name');
    }
    changes.name = value;
  }
  if (input.description !== undefined) {
    const value = input.description;
    if (value !== null && (typeof value !== 'string' || value.length > EPIC_DESCRIPTION_MAX)) {
      return fail('Description is too long.', 'description');
    }
    changes.description = value?.trim() ? value : null;
  }
  if (input.status !== undefined) {
    if (!isInitiativeStatus(input.status)) return fail('Invalid status.', 'status');
    changes.status = input.status;
  }
  if (input.ownerId !== undefined) {
    if (
      input.ownerId !== null &&
      (typeof input.ownerId !== 'string' || !(await isWorkspaceMember(workspaceId, input.ownerId)))
    ) {
      return fail('The owner must be a workspace member.', 'ownerId');
    }
    changes.ownerId = input.ownerId;
  }
  if (input.targetDate !== undefined) {
    if (input.targetDate !== null && !isDateString(input.targetDate)) {
      return fail('Invalid date.', 'targetDate');
    }
    changes.targetDate = input.targetDate;
  }
  return changes;
}

export async function createInitiative(
  input: InitiativeInput & { workspaceId: string },
): Promise<InitiativeActionResult> {
  const authz = await authorizeWorkspace(input?.workspaceId);
  if (!authz.ok) return authz;
  const { workspaceId, slug, userId } = authz.membership;

  const changes = await validate(workspaceId, { ...input, name: input.name ?? '' });
  if ('ok' in changes) return changes;
  const now = new Date();
  const id = crypto.randomUUID();
  await db.insert(initiatives).values({
    id,
    workspaceId,
    name: changes.name!,
    description: changes.description ?? null,
    status: changes.status ?? 'planned',
    ownerId: changes.ownerId === undefined ? userId : changes.ownerId,
    targetDate: changes.targetDate ?? null,
    createdAt: now,
    updatedAt: now,
  });
  revalidateWorkspace(slug);
  return { ok: true, id };
}

export async function updateInitiative(input: {
  workspaceId: string;
  id: string;
  patch: InitiativeInput;
}): Promise<InitiativeActionResult> {
  const authz = await authorizeWorkspace(input?.workspaceId);
  if (!authz.ok) return authz;
  const { workspaceId, slug } = authz.membership;

  const changes = await validate(workspaceId, input.patch ?? {});
  if ('ok' in changes) return changes;
  if (Object.keys(changes).length === 0) return { ok: true, id: input.id };
  const updated = await db
    .update(initiatives)
    .set({ ...changes, updatedAt: new Date() })
    .where(and(eq(initiatives.id, input.id), eq(initiatives.workspaceId, workspaceId)))
    .returning({ id: initiatives.id });
  if (updated.length === 0) return fail('Initiative not found.');
  revalidateWorkspace(slug);
  return { ok: true, id: input.id };
}

/** Workspace admins or the initiative's owner. Linked epics are unlinked (FK set null). */
export async function deleteInitiative(input: {
  workspaceId: string;
  id: string;
}): Promise<InitiativeActionResult> {
  const authz = await authorizeWorkspace(input?.workspaceId);
  if (!authz.ok) return authz;
  const { workspaceId, slug, userId, role } = authz.membership;

  const [initiative] = await db
    .select({ id: initiatives.id, ownerId: initiatives.ownerId })
    .from(initiatives)
    .where(and(eq(initiatives.id, input.id), eq(initiatives.workspaceId, workspaceId)))
    .limit(1);
  if (!initiative) return fail('Initiative not found.');
  if (role === 'member' && initiative.ownerId !== userId) {
    return fail('Only the owner or a workspace admin can delete this initiative.');
  }
  await db.delete(initiatives).where(eq(initiatives.id, initiative.id));
  revalidateWorkspace(slug);
  return { ok: true };
}

/** Link (or with null, unlink) an epic to an initiative of its project's workspace. */
export async function setEpicInitiative(input: {
  projectId: string;
  epicId: string;
  initiativeId: string | null;
}): Promise<InitiativeActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;

  const [epic] = await db
    .select({
      id: epics.id,
      initiativeId: epics.initiativeId,
      workspaceId: projects.workspaceId,
    })
    .from(epics)
    .innerJoin(projects, eq(epics.projectId, projects.id))
    .where(and(eq(epics.id, input.epicId), eq(epics.projectId, input.projectId)))
    .limit(1);
  if (!epic) return fail('Epic not found.');

  const slugs = new Set<string>();
  const previous = epic.initiativeId;
  if (input.initiativeId !== null) {
    if (typeof input.initiativeId !== 'string' || !epic.workspaceId) {
      return fail('This project is not in a workspace.');
    }
    const [initiative] = await db
      .select({ id: initiatives.id, workspaceId: initiatives.workspaceId })
      .from(initiatives)
      .where(
        and(eq(initiatives.id, input.initiativeId), eq(initiatives.workspaceId, epic.workspaceId)),
      )
      .limit(1);
    if (!initiative || !(await isWorkspaceMember(initiative.workspaceId, authz.userId))) {
      return fail('Initiative not found.');
    }
  }

  await db
    .update(epics)
    .set({ initiativeId: input.initiativeId, updatedAt: new Date() })
    .where(and(eq(epics.id, epic.id), eq(epics.projectId, input.projectId)));

  // Both the old and the new initiative pages show this epic.
  const ids = [previous, input.initiativeId].filter((id): id is string => Boolean(id));
  for (const id of ids) {
    const [row] = await db
      .select({ slug: workspaces.slug })
      .from(initiatives)
      .innerJoin(workspaces, eq(initiatives.workspaceId, workspaces.id))
      .where(eq(initiatives.id, id))
      .limit(1);
    if (row) slugs.add(row.slug);
  }
  for (const slug of slugs) revalidateWorkspace(slug);
  revalidatePath(`/dashboard/projects/${input.projectId}`, 'layout');
  return { ok: true };
}
