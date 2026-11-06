// Initiative mutations. Initiatives belong to a workspace, so these authorize
// with requireWorkspaceMember (delete: workspace admin or the initiative's
// owner). Linking an epic also needs write access to the epic's project, and
// the project must sit in the initiative's workspace.

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { epics, initiatives, projects } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { isDateString } from '@/lib/dates';
import {
  fail,
  isFail,
  refreshesData,
  requiredText,
  type ActionResult,
  type Fail,
} from '@/lib/server/action-kit';
import { authorizeWorkspaceAction } from '@/lib/server/workspace-authz';
import { getWorkspaceMembership } from '@/lib/workspace-access';
import { workspaceRoleAllows } from '@/lib/workspace-types';
import {
  INITIATIVE_DESCRIPTION_MAX,
  INITIATIVE_NAME_MAX,
  isInitiativeStatus,
  type InitiativeStatus,
} from '@/lib/initiative-model';

export type InitiativeActionResult = ActionResult<{ id?: string }>;

/** A workspace member, by workspace id (slugs are for URLs). */
async function isWorkspaceMember(workspaceId: string, userId: string) {
  const membership = await getWorkspaceMembership(workspaceId, userId);
  return membership?.workspaceId === workspaceId;
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
    const value = requiredText(input.name, 'name', INITIATIVE_NAME_MAX);
    if (isFail(value)) return value;
    changes.name = value;
  }
  if (input.description !== undefined) {
    const value = input.description;
    if (value !== null && (typeof value !== 'string' || value.length > INITIATIVE_DESCRIPTION_MAX)) {
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
  const authz = await authorizeWorkspaceAction(input?.workspaceId, 'member');
  if (!authz.ok) return authz;
  const { workspaceId, userId } = authz.membership;

  const changes = await validate(workspaceId, { ...input, name: input.name ?? '' });
  if (isFail(changes)) return changes;
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
  refreshesData();
  return { ok: true, id };
}

export async function updateInitiative(input: {
  workspaceId: string;
  id: string;
  patch: InitiativeInput;
}): Promise<InitiativeActionResult> {
  const authz = await authorizeWorkspaceAction(input?.workspaceId, 'member');
  if (!authz.ok) return authz;
  const { workspaceId } = authz.membership;

  const changes = await validate(workspaceId, input.patch ?? {});
  if (isFail(changes)) return changes;
  if (Object.keys(changes).length === 0) return { ok: true, id: input.id };
  const updated = await db
    .update(initiatives)
    .set({ ...changes, updatedAt: new Date() })
    .where(and(eq(initiatives.id, input.id), eq(initiatives.workspaceId, workspaceId)))
    .returning({ id: initiatives.id });
  if (updated.length === 0) return fail('Initiative not found.');
  refreshesData();
  return { ok: true, id: input.id };
}

/** Workspace admins or the initiative's owner. Linked epics are unlinked (FK set null). */
export async function deleteInitiative(input: {
  workspaceId: string;
  id: string;
}): Promise<InitiativeActionResult> {
  const authz = await authorizeWorkspaceAction(input?.workspaceId, 'member');
  if (!authz.ok) return authz;
  const { workspaceId, userId, role } = authz.membership;

  const [initiative] = await db
    .select({ id: initiatives.id, ownerId: initiatives.ownerId })
    .from(initiatives)
    .where(and(eq(initiatives.id, input.id), eq(initiatives.workspaceId, workspaceId)))
    .limit(1);
  if (!initiative) return fail('Initiative not found.');
  if (!workspaceRoleAllows(role, 'admin') && initiative.ownerId !== userId) {
    return fail('Only the owner or a workspace admin can delete this initiative.');
  }
  await db.delete(initiatives).where(eq(initiatives.id, initiative.id));
  refreshesData();
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
      workspaceId: projects.workspaceId,
    })
    .from(epics)
    .innerJoin(projects, eq(epics.projectId, projects.id))
    .where(and(eq(epics.id, input.epicId), eq(epics.projectId, input.projectId)))
    .limit(1);
  if (!epic) return fail('Epic not found.');

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

  refreshesData();
  return { ok: true };
}
