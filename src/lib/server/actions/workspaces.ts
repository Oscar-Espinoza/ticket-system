// Workspaces: an optional grouping of projects ("teams") with its own members.
//
// Roles: owner (one; deletes the workspace, changes roles), admin (manages
// projects and members), member (sees the workspace, creates projects in it).
// Workspace membership never grants access to a project's data — that still
// needs project membership. Moving a project in or out of a workspace needs
// project admin (you decide where your project lives) plus workspace admin to
// add it. Every action resolves the session itself; ids from the client are
// re-scoped to the workspace in every query.

import { redirect } from '@/lib/kit/request';
import { and, eq, gt, isNull, ne, or, sql } from 'drizzle-orm';

import { recordWorkspaceEvent } from '@/lib/audit';
import { db } from '@/lib/db';
import {
  projectMembers,
  projects,
  users,
  workspaceInvitations,
  workspaceMembers,
  workspaces,
} from '@/db/schema';
import { getSession } from '@/lib/session';
import { authorizeProjectAction } from '@/lib/action-auth';
import {
  emailAddress,
  fail,
  FORBIDDEN,
  isFail,
  NOT_AUTHENTICATED,
  refreshesData,
  requiredText,
  type ActionResult,
} from '@/lib/server/action-kit';
import { createProjectRecord, firstProjectError } from '@/lib/server/project-create';
import { authorizeWorkspaceAction } from '@/lib/server/workspace-authz';
import { isUniqueViolation } from '@/lib/db-errors';
import { getSharedProjects } from '@/lib/project-access';
import {
  getPendingWorkspaceInvite,
  newWorkspaceInviteToken,
  WORKSPACE_INVITE_TTL_MS,
  workspaceInviteUrl,
  type WorkspaceInviteRole,
  type WorkspaceMembership,
} from '@/lib/workspace-access';
import { inviteRolesFor, workspaceRoleAllows } from '@/lib/workspace-types';
import { sendEmail } from '@/lib/email';
import { isValidSlug, slugify } from '@/lib/workspace-slug';

export type WorkspaceField =
  | 'name'
  | 'slug'
  | 'confirm'
  | 'email'
  | 'role'
  | 'ticketKey'
  | 'projectId'
  | 'templateId';

export type WorkspaceActionResult = ActionResult<
  { slug?: string; added?: boolean; emailed?: boolean; url?: string },
  WorkspaceField
>;

const NAME_MAX = 60;

// ---------------------------------------------------------------------------
// Workspace lifecycle
// ---------------------------------------------------------------------------

export async function createWorkspace(input: {
  name: string;
  slug?: string;
}): Promise<WorkspaceActionResult> {
  const session = await getSession();
  if (!session?.user) return NOT_AUTHENTICATED;

  const name = requiredText(input?.name, 'name', NAME_MAX);
  if (isFail(name)) return name;
  const slug = (typeof input.slug === 'string' && input.slug.trim()) || slugify(name);
  if (!isValidSlug(slug)) {
    return fail('URL must be 2–40 lowercase letters, numbers or dashes.', 'slug');
  }

  const id = crypto.randomUUID();
  const now = new Date();
  try {
    await db.batch([
      db.insert(workspaces).values({
        id,
        name,
        slug,
        ownerId: session.user.id,
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(workspaceMembers).values({
        id: crypto.randomUUID(),
        workspaceId: id,
        userId: session.user.id,
        role: 'owner',
        createdAt: now,
      }),
    ]);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return fail('This URL is taken. Try another one.', 'slug');
    }
    throw err;
  }

  refreshesData();
  return { ok: true, slug };
}

export async function renameWorkspace(input: {
  workspaceId: string;
  name: string;
}): Promise<WorkspaceActionResult> {
  const authz = await authorizeWorkspaceAction(input?.workspaceId, 'admin');
  if (!authz.ok) return authz;
  const name = requiredText(input.name, 'name', NAME_MAX);
  if (isFail(name)) return name;

  await db
    .update(workspaces)
    .set({ name, updatedAt: new Date() })
    .where(eq(workspaces.id, authz.membership.workspaceId));
  refreshesData();
  return { ok: true, slug: authz.membership.slug };
}

/** Owner only; the typed name is re-checked here. Projects are un-grouped (FK set null). */
export async function deleteWorkspace(input: {
  workspaceId: string;
  confirm: string;
}): Promise<WorkspaceActionResult> {
  const authz = await authorizeWorkspaceAction(input?.workspaceId, 'owner');
  if (!authz.ok) return authz;
  if ((input.confirm ?? '').trim() !== authz.membership.name) {
    return fail('Type the workspace name exactly to confirm.', 'confirm');
  }

  await db.delete(workspaces).where(eq(workspaces.id, authz.membership.workspaceId));
  refreshesData();
  redirect('/dashboard');
}

export async function leaveWorkspace(input: { workspaceId: string }): Promise<WorkspaceActionResult> {
  const authz = await authorizeWorkspaceAction(input?.workspaceId, 'member');
  if (!authz.ok) return authz;
  if (authz.membership.role === 'owner') {
    return fail('The owner can’t leave. Delete the workspace instead.');
  }

  await db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, authz.membership.workspaceId),
        eq(workspaceMembers.userId, authz.userId),
      ),
    );
  refreshesData();
  redirect('/dashboard');
}

// ---------------------------------------------------------------------------
// Projects (teams) in the workspace
// ---------------------------------------------------------------------------

export async function addProjectToWorkspace(input: {
  workspaceId: string;
  projectId: string;
}): Promise<WorkspaceActionResult> {
  const authz = await authorizeWorkspaceAction(input?.workspaceId, 'admin');
  if (!authz.ok) return authz;
  const project = await authorizeProjectAction(input.projectId, 'admin');
  if (!project.ok) {
    return fail('You need to be an admin of that project.', 'projectId');
  }

  // Sub-team links never cross workspaces: the project leaves its old parent
  // and its sub-teams (still in the old workspace) are detached.
  await db.batch([
    db
      .update(projects)
      .set({ workspaceId: authz.membership.workspaceId, parentId: null, updatedAt: new Date() })
      .where(eq(projects.id, input.projectId)),
    detachSubTeams(input.projectId, authz.membership.workspaceId),
  ]);
  refreshesData();
  return { ok: true };
}

/** Workspace admins, or the project's own admins, can take a project out. */
export async function removeProjectFromWorkspace(input: {
  workspaceId: string;
  projectId: string;
}): Promise<WorkspaceActionResult> {
  const authz = await authorizeWorkspaceAction(input?.workspaceId, 'member');
  if (!authz.ok) return authz;
  if (!workspaceRoleAllows(authz.membership.role, 'admin')) {
    const project = await authorizeProjectAction(input.projectId, 'admin');
    if (!project.ok) return FORBIDDEN;
  }

  const projectId = typeof input.projectId === 'string' ? input.projectId : '';
  const updated = await db
    .update(projects)
    .set({ workspaceId: null, parentId: null, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, authz.membership.workspaceId)))
    .returning({ id: projects.id });
  if (updated.length === 0) return fail('Project not found in this workspace.');
  // Only once the project is confirmed to have been in this workspace.
  await detachSubTeams(projectId, null);

  refreshesData();
  return { ok: true };
}

/** Sub-teams of `projectId` outside `workspaceId` (null = any) lose their parent. */
function detachSubTeams(projectId: string, workspaceId: string | null) {
  return db
    .update(projects)
    .set({ parentId: null })
    .where(
      and(
        eq(projects.parentId, projectId),
        workspaceId
          ? or(isNull(projects.workspaceId), ne(projects.workspaceId, workspaceId))
          : undefined,
      ),
    );
}

/** createProject inside the workspace; `templateId` seeds it from a project template. */
export async function createWorkspaceProject(input: {
  workspaceId: string;
  name: string;
  ticketKey: string;
  templateId?: string;
}): Promise<WorkspaceActionResult & { projectId?: string }> {
  const authz = await authorizeWorkspaceAction(input?.workspaceId, 'member');
  if (!authz.ok) return authz;

  const created = await createProjectRecord({
    userId: authz.userId,
    name: typeof input.name === 'string' ? input.name.trim() : '',
    ticketKey: typeof input.ticketKey === 'string' ? input.ticketKey.trim() : '',
    templateId: typeof input.templateId === 'string' ? input.templateId : '',
    workspaceId: authz.membership.workspaceId,
  });
  if (!created.ok) return firstProjectError(created.errors);
  const { projectId } = created;

  refreshesData();
  return { ok: true, projectId };
}

/**
 * Private teams: any workspace member may join a project of the
 * workspace whose visibility is 'workspace', as a member. Private projects
 * answer "not found" so their existence doesn't leak.
 */
export async function joinWorkspaceProject(input: {
  workspaceId: string;
  projectId: string;
}): Promise<WorkspaceActionResult & { projectId?: string }> {
  const authz = await authorizeWorkspaceAction(input?.workspaceId, 'member');
  if (!authz.ok) return authz;
  const projectId = typeof input.projectId === 'string' ? input.projectId : '';
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.workspaceId, authz.membership.workspaceId),
        eq(projects.visibility, 'workspace'),
      ),
    )
    .limit(1);
  if (!project) return fail('Project not found.', 'projectId');

  await db
    .insert(projectMembers)
    .values({
      id: crypto.randomUUID(),
      projectId,
      userId: authz.userId,
      role: 'member',
      createdAt: new Date(),
    })
    .onConflictDoNothing();
  refreshesData();
  return { ok: true, projectId };
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

/**
 * Add someone by email. A person who already shares a project with you is
 * added directly; anyone else gets an emailed, single-use invitation link
 * (a workspace_invitation row — re-inviting replaces the pending one). The
 * reply doesn't say whether an account exists for the address.
 */
export async function inviteWorkspaceMember(input: {
  workspaceId: string;
  email: string;
  role: 'admin' | 'member';
}): Promise<WorkspaceActionResult> {
  const authz = await authorizeWorkspaceAction(input?.workspaceId, 'admin');
  if (!authz.ok) return authz;

  const email = emailAddress(input.email);
  if (isFail(email)) return email;
  const role = input.role;
  if ((role !== 'admin' && role !== 'member') || !inviteRolesFor(authz.membership.role).includes(role)) {
    return fail('You can’t invite people with that role.', 'role');
  }
  const workspaceId = authz.membership.workspaceId;

  const [target] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  const knownToCaller =
    target && (target.id === authz.userId || (await getSharedProjects(authz.userId, target.id)).length > 0);

  if (target && knownToCaller) {
    const [existing] = await db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, target.id)))
      .limit(1);
    if (existing) return fail(`${target.name} is already a member.`, 'email');
    try {
      await db.insert(workspaceMembers).values({
        id: crypto.randomUUID(),
        workspaceId,
        userId: target.id,
        role,
        createdAt: new Date(),
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
    refreshesData();
    return { ok: true, added: true };
  }

  const token = newWorkspaceInviteToken();
  const now = new Date();
  // Re-inviting a pending address replaces its row (fresh token and expiry).
  try {
    await db.batch([
      db
        .delete(workspaceInvitations)
        .where(
          and(
            eq(workspaceInvitations.workspaceId, workspaceId),
            eq(workspaceInvitations.email, email),
            isNull(workspaceInvitations.acceptedAt),
          ),
        ),
      db.insert(workspaceInvitations).values({
        id: crypto.randomUUID(),
        workspaceId,
        email,
        role,
        token,
        invitedById: authz.userId,
        expiresAt: new Date(now.getTime() + WORKSPACE_INVITE_TTL_MS),
        createdAt: now,
      }),
    ]);
  } catch (err) {
    if (isUniqueViolation(err)) return fail('Could not create the invitation, try again.');
    throw err;
  }

  const emailed = await sendWorkspaceInviteEmail({
    to: email,
    workspaceName: authz.membership.name,
    inviterId: authz.userId,
    role,
    token,
  });
  refreshesData();
  return { ok: true, added: false, emailed, url: workspaceInviteUrl(token) };
}

async function sendWorkspaceInviteEmail(opts: {
  to: string;
  workspaceName: string;
  inviterId: string;
  role: WorkspaceInviteRole;
  token: string;
}): Promise<boolean> {
  const [inviter] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, opts.inviterId))
    .limit(1);
  const inviterName = inviter?.name ?? 'A teammate';
  return sendEmail({
    to: opts.to,
    subject: `${inviterName} invited you to the ${opts.workspaceName} workspace`,
    text: [
      `${inviterName} invited you to join the ${opts.workspaceName} workspace as ${opts.role === 'admin' ? 'an admin' : 'a member'}.`,
      '',
      `Accept the invitation: ${workspaceInviteUrl(opts.token)}`,
      '',
      `Sign in (or sign up) with ${opts.to} to accept. The link expires in 7 days.`,
    ].join('\n'),
  });
}

/** A pending invitation of the caller's workspace that the caller may manage. */
async function manageableInvitation(
  authz: { membership: WorkspaceMembership },
  invitationId: unknown,
) {
  if (typeof invitationId !== 'string' || !invitationId) return null;
  const [row] = await db
    .select({
      id: workspaceInvitations.id,
      email: workspaceInvitations.email,
      role: workspaceInvitations.role,
      token: workspaceInvitations.token,
    })
    .from(workspaceInvitations)
    .where(
      and(
        eq(workspaceInvitations.id, invitationId),
        eq(workspaceInvitations.workspaceId, authz.membership.workspaceId),
        isNull(workspaceInvitations.acceptedAt),
      ),
    )
    .limit(1);
  // Admins handle member invitations; admin invitations are the owner's.
  return row && inviteRolesFor(authz.membership.role).includes(row.role) ? row : null;
}

/** New 7-day expiry (same token, so the earlier email keeps working) + a fresh email. */
export async function resendWorkspaceInvitation(input: {
  workspaceId: string;
  invitationId: string;
}): Promise<WorkspaceActionResult> {
  const authz = await authorizeWorkspaceAction(input?.workspaceId, 'admin');
  if (!authz.ok) return authz;
  const invitation = await manageableInvitation(authz, input.invitationId);
  if (!invitation) return fail('Invitation not found.');

  await db
    .update(workspaceInvitations)
    .set({ expiresAt: new Date(Date.now() + WORKSPACE_INVITE_TTL_MS), invitedById: authz.userId })
    .where(
      and(
        eq(workspaceInvitations.id, invitation.id),
        eq(workspaceInvitations.workspaceId, authz.membership.workspaceId),
      ),
    );
  const emailed = await sendWorkspaceInviteEmail({
    to: invitation.email,
    workspaceName: authz.membership.name,
    inviterId: authz.userId,
    role: invitation.role,
    token: invitation.token,
  });
  refreshesData();
  return { ok: true, emailed, url: workspaceInviteUrl(invitation.token) };
}

export async function revokeWorkspaceInvitation(input: {
  workspaceId: string;
  invitationId: string;
}): Promise<WorkspaceActionResult> {
  const authz = await authorizeWorkspaceAction(input?.workspaceId, 'admin');
  if (!authz.ok) return authz;
  const invitation = await manageableInvitation(authz, input.invitationId);
  if (!invitation) return fail('Invitation not found.');

  await db
    .delete(workspaceInvitations)
    .where(
      and(
        eq(workspaceInvitations.id, invitation.id),
        eq(workspaceInvitations.workspaceId, authz.membership.workspaceId),
      ),
    );
  refreshesData();
  return { ok: true };
}

/** Owner only: switch a non-owner member between admin and member. */
export async function updateWorkspaceMemberRole(input: {
  workspaceId: string;
  userId: string;
  role: 'admin' | 'member';
}): Promise<WorkspaceActionResult> {
  const authz = await authorizeWorkspaceAction(input?.workspaceId, 'owner');
  if (!authz.ok) return authz;
  if (input.role !== 'admin' && input.role !== 'member') {
    return fail('Pick admin or member.', 'role');
  }
  if (input.userId === authz.userId) return fail('You can’t change your own role.');

  const updated = await db
    .update(workspaceMembers)
    .set({ role: input.role })
    .where(
      and(
        eq(workspaceMembers.workspaceId, authz.membership.workspaceId),
        eq(workspaceMembers.userId, typeof input.userId === 'string' ? input.userId : ''),
        sql`${workspaceMembers.role} <> 'owner'`,
      ),
    )
    .returning({ id: workspaceMembers.id });
  if (updated.length === 0) return fail('Member not found.');

  await recordWorkspaceEvent(authz.membership.workspaceId, {
    actorId: authz.userId,
    type: 'workspace.role_changed',
    summary: `changed a member's workspace role to ${input.role}`,
    data: { userId: input.userId, role: input.role },
  });
  refreshesData();
  return { ok: true };
}

/** Admins remove members; only the owner removes admins; nobody removes the owner. */
export async function removeWorkspaceMember(input: {
  workspaceId: string;
  userId: string;
}): Promise<WorkspaceActionResult> {
  const authz = await authorizeWorkspaceAction(input?.workspaceId, 'admin');
  if (!authz.ok) return authz;
  if (input.userId === authz.userId) {
    return fail('Use “Leave workspace” to remove yourself.');
  }

  const workspaceId = authz.membership.workspaceId;
  const [target] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, typeof input.userId === 'string' ? input.userId : ''),
      ),
    )
    .limit(1);
  if (!target) return fail('Member not found.');
  if (target.role === 'owner') return fail('The owner can’t be removed.');
  if (target.role === 'admin' && authz.membership.role !== 'owner') return FORBIDDEN;

  await db
    .delete(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, input.userId)),
    );
  await recordWorkspaceEvent(workspaceId, {
    actorId: authz.userId,
    type: 'workspace.member_removed',
    summary: 'removed a member from the workspace',
    data: { userId: input.userId },
  });
  refreshesData();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Accepting an emailed workspace invitation (/invite/workspace/[token])
// ---------------------------------------------------------------------------

export type AcceptWorkspaceInviteState = {
  error?: typeof NOT_AUTHENTICATED.error | 'invalid' | 'wrong-account';
};

export async function acceptWorkspaceInvite(
  _prev: AcceptWorkspaceInviteState,
  formData: FormData,
): Promise<AcceptWorkspaceInviteState> {
  const session = await getSession();
  if (!session?.user) return { error: NOT_AUTHENTICATED.error };

  const invite = await getPendingWorkspaceInvite(
    ((formData.get('token') as string | null) ?? '').trim(),
  );
  if (!invite) return { error: 'invalid' };
  if (invite.email.toLowerCase() !== session.user.email.toLowerCase()) {
    return { error: 'wrong-account' };
  }

  const [workspace] = await db
    .select({ slug: workspaces.slug })
    .from(workspaces)
    .where(eq(workspaces.id, invite.workspaceId))
    .limit(1);
  if (!workspace) return { error: 'invalid' };

  // Claim first so the link is single use: of two concurrent accepts (or a
  // revoke racing an accept) exactly one UPDATE matches.
  const now = new Date();
  const claimed = await db
    .update(workspaceInvitations)
    .set({ acceptedAt: now })
    .where(
      and(
        eq(workspaceInvitations.id, invite.id),
        isNull(workspaceInvitations.acceptedAt),
        gt(workspaceInvitations.expiresAt, now),
      ),
    )
    .returning({ id: workspaceInvitations.id });
  if (claimed.length === 0) return { error: 'invalid' };

  try {
    // Existing members keep their role (the unique pair makes this a no-op).
    await db
      .insert(workspaceMembers)
      .values({
        id: crypto.randomUUID(),
        workspaceId: invite.workspaceId,
        userId: session.user.id,
        role: invite.role,
        createdAt: now,
      })
      .onConflictDoNothing();
  } catch (err) {
    // Give the invitation back so the person can retry.
    await db
      .update(workspaceInvitations)
      .set({ acceptedAt: null })
      .where(eq(workspaceInvitations.id, invite.id));
    throw err;
  }

  await recordWorkspaceEvent(invite.workspaceId, {
    actorId: session.user.id,
    type: 'workspace.member_joined',
    summary: `joined the workspace as ${invite.role}`,
    data: { userId: session.user.id, role: invite.role },
  });
  refreshesData();
  redirect(`/dashboard/workspaces/${workspace.slug}`);
}
