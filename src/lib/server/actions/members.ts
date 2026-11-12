// Project member management: remove, change role, transfer ownership.
//
// Who may do what lives in @/lib/roles (shared with the UI): the owner manages
// everyone but themselves; admins manage member and guest rows and can only
// hand out member/guest. The owner row changes only
// through transferOwnership. Every action authorizes with the session first
// and scopes the target row by (id, projectId), so ids can't reach across
// projects. neon-http: multi-row changes go through db.batch.

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projectMembers, projects, users } from '@/db/schema';
import { authorizeProjectAction } from '@/lib/action-auth';
import { commitWithEvents, prepareIssueEvents, publishIssueEvents } from '@/lib/events';
import {
  fail,
  FORBIDDEN,
  formField,
  refreshesData,
  type ActionResult,
} from '@/lib/server/action-kit';
import { PROJECT_ROLE_LABEL, canManageMember, canSetRole, type ProjectRole } from '@/lib/roles';

export type RemoveMemberState = {
  errors?: {
    server?: string;
  };
  success?: boolean;
};

export type MemberActionResult = ActionResult;

async function loadTarget(projectId: string, memberId: string) {
  if (!memberId) return null;
  const [row] = await db
    .select({
      id: projectMembers.id,
      userId: projectMembers.userId,
      role: projectMembers.role,
      name: users.name,
    })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(and(eq(projectMembers.id, memberId), eq(projectMembers.projectId, projectId)))
    .limit(1);
  return row ?? null;
}

export async function removeMember(
  _prevState: RemoveMemberState,
  formData: FormData,
): Promise<RemoveMemberState> {
  const projectId = formField(formData, 'projectId');
  const memberId = formField(formData, 'memberId');
  if (!projectId || !memberId) {
    return { errors: { server: 'Missing required fields.' } };
  }

  const authz = await authorizeProjectAction(projectId, 'admin');
  if (!authz.ok) return { errors: { server: authz.error } };

  const target = await loadTarget(projectId, memberId);
  if (!target) return { errors: { server: 'Member not found.' } };
  if (target.userId === authz.userId) {
    return { errors: { server: 'You cannot remove yourself.' } };
  }
  if (target.role === 'owner') {
    return { errors: { server: 'The project owner cannot be removed.' } };
  }
  if (!canManageMember(authz.role, target.role)) {
    return { errors: { server: 'Forbidden' } };
  }

  await commitWithEvents(
    [db.delete(projectMembers).where(and(eq(projectMembers.id, memberId), eq(projectMembers.projectId, projectId)))],
    [
      {
        projectId,
        ticketId: null,
        actorId: authz.userId,
        type: 'member.removed',
        data: { userId: target.userId, name: target.name, summary: `removed ${target.name}` },
      },
    ],
  );

  refreshesData();
  return { success: true };
}

export async function updateMemberRole(input: {
  projectId: string;
  memberId: string;
  role: ProjectRole;
}): Promise<MemberActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'admin');
  if (!authz.ok) return authz;

  const target = await loadTarget(input.projectId, input.memberId);
  if (!target) return fail('Member not found.');
  if (target.userId === authz.userId) {
    return fail('You cannot change your own role.');
  }
  if (target.role === input.role) return { ok: true };
  if (!canSetRole(authz.role, target.role, input.role)) {
    return FORBIDDEN;
  }

  await commitWithEvents(
    [
      db
        .update(projectMembers)
        .set({ role: input.role })
        .where(and(eq(projectMembers.id, target.id), eq(projectMembers.projectId, input.projectId))),
    ],
    [
      {
        projectId: input.projectId,
        ticketId: null,
        actorId: authz.userId,
        type: 'member.role_changed',
        data: {
          userId: target.userId,
          name: target.name,
          from: target.role,
          to: input.role,
          summary: `changed ${target.name}'s role to ${PROJECT_ROLE_LABEL[input.role]}`,
        },
      },
    ],
  );

  refreshesData();
  return { ok: true };
}

/** Owner only. The new owner's row becomes owner, the old owner becomes admin. */
export async function transferOwnership(input: {
  projectId: string;
  memberId: string;
}): Promise<MemberActionResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'admin');
  if (!authz.ok) return authz;
  if (authz.role !== 'owner') return fail('Only the owner can transfer ownership.');

  const target = await loadTarget(input.projectId, input.memberId);
  if (!target) return fail('Member not found.');
  if (target.userId === authz.userId) return fail('You already own this project.');

  const now = new Date();
  const { stored, insert } = prepareIssueEvents([
    {
      projectId: input.projectId,
      ticketId: null,
      actorId: authz.userId,
      type: 'project.ownership_transferred',
      data: {
        userId: target.userId,
        name: target.name,
        summary: `transferred ownership to ${target.name}`,
      },
    },
  ]);
  // One batch (one transaction) so the project never has two owners or none.
  await db.batch([
    db
      .update(projectMembers)
      .set({ role: 'admin' })
      .where(
        and(
          eq(projectMembers.projectId, input.projectId),
          eq(projectMembers.userId, authz.userId),
        ),
      ),
    db
      .update(projectMembers)
      .set({ role: 'owner' })
      .where(
        and(eq(projectMembers.id, target.id), eq(projectMembers.projectId, input.projectId)),
      ),
    db
      .update(projects)
      .set({ ownerId: target.userId, updatedAt: now })
      .where(eq(projects.id, input.projectId)),
    insert,
  ]);
  publishIssueEvents(stored);

  refreshesData();
  return { ok: true };
}
