'use server';

// Workspaces: an optional grouping of projects ("teams") with its own members.
//
// Roles: owner (one; deletes the workspace, changes roles), admin (manages
// projects and members), member (sees the workspace, creates projects in it).
// Workspace membership never grants access to a project's data — that still
// needs project membership. Moving a project in or out of a workspace needs
// project admin (you decide where your project lives) plus workspace admin to
// add it. Every action resolves the session itself; ids from the client are
// re-scoped to the workspace in every query.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  projectMembers,
  projects,
  users,
  workflowStates,
  workspaceMembers,
  workspaces,
} from '@/db/schema';
import { getSession } from '@/lib/session';
import { authorizeProjectAction } from '@/lib/action-auth';
import { getSharedProjects } from '@/lib/project-access';
import {
  getWorkspaceMembership,
  signWorkspaceInvite,
  verifyWorkspaceInvite,
  WORKSPACE_INVITE_TTL_MS,
  type WorkspaceMembership,
  type WorkspaceRole,
} from '@/lib/workspace-access';
import { workflowStateInserts } from '@/lib/workflow-server';
import { sendEmail } from '@/lib/email';
import { isValidSlug, slugify } from '@/components/workspaces/slug';

export type WorkspaceField = 'name' | 'slug' | 'confirm' | 'email' | 'role' | 'ticketKey' | 'projectId';

export type WorkspaceActionResult =
  | { ok: true; slug?: string; added?: boolean; emailed?: boolean; url?: string }
  | { ok: false; error: string; field?: WorkspaceField };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 60;

const NOT_AUTHENTICATED: WorkspaceActionResult = { ok: false, error: 'Not authenticated' };
const FORBIDDEN: WorkspaceActionResult = { ok: false, error: 'Forbidden' };

function isUniqueViolation(err: unknown) {
  const code =
    (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === '23505';
}

function validateName(value: unknown): string | WorkspaceActionResult {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) return { ok: false, error: 'Name is required.', field: 'name' };
  if (name.length > NAME_MAX) {
    return { ok: false, error: `Name must be ${NAME_MAX} characters or fewer.`, field: 'name' };
  }
  return name;
}

const isError = (value: unknown): value is WorkspaceActionResult =>
  typeof value === 'object' && value !== null && 'ok' in value;

function revalidateWorkspace(slug?: string) {
  // The sidebar lists workspaces on every dashboard page.
  revalidatePath('/dashboard', 'layout');
  if (slug) revalidatePath(`/dashboard/workspaces/${slug}`, 'layout');
}

/** Session + workspace membership (+ minimum role). */
async function authorizeWorkspace(
  workspaceId: unknown,
  need: WorkspaceRole,
): Promise<{ userId: string; membership: WorkspaceMembership } | WorkspaceActionResult> {
  const session = await getSession();
  if (!session?.user) return NOT_AUTHENTICATED;
  if (typeof workspaceId !== 'string' || !workspaceId) return FORBIDDEN;
  const membership = await getWorkspaceMembership(workspaceId, session.user.id);
  // Only by id: slugs are for URLs, actions always carry the id.
  if (!membership || membership.workspaceId !== workspaceId) return FORBIDDEN;
  const rank: Record<WorkspaceRole, number> = { owner: 2, admin: 1, member: 0 };
  if (rank[membership.role] < rank[need]) return FORBIDDEN;
  return { userId: session.user.id, membership };
}

// ---------------------------------------------------------------------------
// Workspace lifecycle
// ---------------------------------------------------------------------------

export async function createWorkspace(input: {
  name: string;
  slug?: string;
}): Promise<WorkspaceActionResult> {
  const session = await getSession();
  if (!session?.user) return NOT_AUTHENTICATED;

  const name = validateName(input?.name);
  if (isError(name)) return name;
  const slug = (typeof input.slug === 'string' && input.slug.trim()) || slugify(name);
  if (!isValidSlug(slug)) {
    return {
      ok: false,
      error: 'URL must be 2–40 lowercase letters, numbers or dashes.',
      field: 'slug',
    };
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
      return { ok: false, error: 'This URL is taken. Try another one.', field: 'slug' };
    }
    throw err;
  }

  revalidateWorkspace();
  return { ok: true, slug };
}

export async function renameWorkspace(input: {
  workspaceId: string;
  name: string;
}): Promise<WorkspaceActionResult> {
  const authz = await authorizeWorkspace(input?.workspaceId, 'admin');
  if (isError(authz)) return authz;
  const name = validateName(input.name);
  if (isError(name)) return name;

  await db
    .update(workspaces)
    .set({ name, updatedAt: new Date() })
    .where(eq(workspaces.id, authz.membership.workspaceId));
  revalidateWorkspace(authz.membership.slug);
  return { ok: true, slug: authz.membership.slug };
}

/** Owner only; the typed name is re-checked here. Projects are un-grouped (FK set null). */
export async function deleteWorkspace(input: {
  workspaceId: string;
  confirm: string;
}): Promise<WorkspaceActionResult> {
  const authz = await authorizeWorkspace(input?.workspaceId, 'owner');
  if (isError(authz)) return authz;
  if ((input.confirm ?? '').trim() !== authz.membership.name) {
    return { ok: false, error: 'Type the workspace name exactly to confirm.', field: 'confirm' };
  }

  await db.delete(workspaces).where(eq(workspaces.id, authz.membership.workspaceId));
  revalidatePath('/dashboard', 'layout');
  redirect('/dashboard');
}

export async function leaveWorkspace(input: { workspaceId: string }): Promise<WorkspaceActionResult> {
  const authz = await authorizeWorkspace(input?.workspaceId, 'member');
  if (isError(authz)) return authz;
  if (authz.membership.role === 'owner') {
    return { ok: false, error: 'The owner can’t leave. Delete the workspace instead.' };
  }

  await db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, authz.membership.workspaceId),
        eq(workspaceMembers.userId, authz.userId),
      ),
    );
  revalidatePath('/dashboard', 'layout');
  redirect('/dashboard');
}

// ---------------------------------------------------------------------------
// Projects (teams) in the workspace
// ---------------------------------------------------------------------------

export async function addProjectToWorkspace(input: {
  workspaceId: string;
  projectId: string;
}): Promise<WorkspaceActionResult> {
  const authz = await authorizeWorkspace(input?.workspaceId, 'admin');
  if (isError(authz)) return authz;
  const project = await authorizeProjectAction(input.projectId, 'admin');
  if (!project.ok) {
    return { ok: false, error: 'You need to be an admin of that project.', field: 'projectId' };
  }

  await db
    .update(projects)
    .set({ workspaceId: authz.membership.workspaceId, updatedAt: new Date() })
    .where(eq(projects.id, input.projectId));
  revalidateWorkspace(authz.membership.slug);
  revalidatePath(`/dashboard/projects/${input.projectId}`, 'layout');
  return { ok: true };
}

/** Workspace admins, or the project's own admins, can take a project out. */
export async function removeProjectFromWorkspace(input: {
  workspaceId: string;
  projectId: string;
}): Promise<WorkspaceActionResult> {
  const authz = await authorizeWorkspace(input?.workspaceId, 'member');
  if (isError(authz)) return authz;
  const isWorkspaceAdmin = authz.membership.role !== 'member';
  if (!isWorkspaceAdmin) {
    const project = await authorizeProjectAction(input.projectId, 'admin');
    if (!project.ok) return FORBIDDEN;
  }

  const updated = await db
    .update(projects)
    .set({ workspaceId: null, updatedAt: new Date() })
    .where(
      and(
        eq(projects.id, typeof input.projectId === 'string' ? input.projectId : ''),
        eq(projects.workspaceId, authz.membership.workspaceId),
      ),
    )
    .returning({ id: projects.id });
  if (updated.length === 0) return { ok: false, error: 'Project not found in this workspace.' };

  revalidateWorkspace(authz.membership.slug);
  revalidatePath(`/dashboard/projects/${input.projectId}`, 'layout');
  return { ok: true };
}

/** Same shape as createProject (project + owner row + default states, one batch), inside the workspace. */
export async function createWorkspaceProject(input: {
  workspaceId: string;
  name: string;
  ticketKey: string;
}): Promise<WorkspaceActionResult & { projectId?: string }> {
  const authz = await authorizeWorkspace(input?.workspaceId, 'member');
  if (isError(authz)) return authz;

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) return { ok: false, error: 'Project name is required.', field: 'name' };
  if (name.length > 100) {
    return { ok: false, error: 'Project name must be 100 characters or fewer.', field: 'name' };
  }
  const ticketKey = typeof input.ticketKey === 'string' ? input.ticketKey.trim() : '';
  if (!/^[A-Z]{2,6}$/.test(ticketKey)) {
    return { ok: false, error: 'Key must be 2–6 uppercase letters.', field: 'ticketKey' };
  }

  const projectId = crypto.randomUUID();
  const now = new Date();
  try {
    await db.batch([
      db.insert(projects).values({
        id: projectId,
        name,
        ticketKey,
        ticketCounter: 0,
        ownerId: authz.userId,
        workspaceId: authz.membership.workspaceId,
        createdAt: now,
        updatedAt: now,
      }),
      db.insert(projectMembers).values({
        id: crypto.randomUUID(),
        projectId,
        userId: authz.userId,
        role: 'owner',
        createdAt: now,
      }),
      db.insert(workflowStates).values(workflowStateInserts(projectId, now)),
    ]);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        ok: false,
        error: 'This key is already in use. Choose a different one.',
        field: 'ticketKey',
      };
    }
    throw err;
  }

  revalidateWorkspace(authz.membership.slug);
  return { ok: true, projectId };
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

const inviteRolesFor = (role: WorkspaceRole): readonly WorkspaceRole[] =>
  role === 'owner' ? ['admin', 'member'] : role === 'admin' ? ['member'] : [];

/**
 * Add someone by email. A person who already shares a project with you is
 * added directly; anyone else gets an emailed invitation link. The reply
 * doesn't say whether an account exists for the address.
 */
export async function inviteWorkspaceMember(input: {
  workspaceId: string;
  email: string;
  role: 'admin' | 'member';
}): Promise<WorkspaceActionResult> {
  const authz = await authorizeWorkspace(input?.workspaceId, 'admin');
  if (isError(authz)) return authz;

  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return { ok: false, error: 'Enter a valid email address.', field: 'email' };
  }
  const role = input.role;
  if ((role !== 'admin' && role !== 'member') || !inviteRolesFor(authz.membership.role).includes(role)) {
    return { ok: false, error: 'You can’t invite people with that role.', field: 'role' };
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
    if (existing) return { ok: false, error: `${target.name} is already a member.`, field: 'email' };
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
    revalidateWorkspace(authz.membership.slug);
    return { ok: true, added: true };
  }

  const token = signWorkspaceInvite({
    workspaceId,
    email,
    role,
    exp: Date.now() + WORKSPACE_INVITE_TTL_MS,
  });
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/invite/workspace/${token}`;
  const [inviter] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, authz.userId))
    .limit(1);
  const inviterName = inviter?.name ?? 'A teammate';
  const emailed = await sendEmail({
    to: email,
    subject: `${inviterName} invited you to the ${authz.membership.name} workspace`,
    text: [
      `${inviterName} invited you to join the ${authz.membership.name} workspace as ${role === 'admin' ? 'an admin' : 'a member'}.`,
      '',
      `Accept the invitation: ${url}`,
      '',
      `Sign in (or sign up) with ${email} to accept. The link expires in 7 days.`,
    ].join('\n'),
  });
  return { ok: true, added: false, emailed, url };
}

/** Owner only: switch a non-owner member between admin and member. */
export async function updateWorkspaceMemberRole(input: {
  workspaceId: string;
  userId: string;
  role: 'admin' | 'member';
}): Promise<WorkspaceActionResult> {
  const authz = await authorizeWorkspace(input?.workspaceId, 'owner');
  if (isError(authz)) return authz;
  if (input.role !== 'admin' && input.role !== 'member') {
    return { ok: false, error: 'Pick admin or member.', field: 'role' };
  }
  if (input.userId === authz.userId) return { ok: false, error: 'You can’t change your own role.' };

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
  if (updated.length === 0) return { ok: false, error: 'Member not found.' };

  revalidateWorkspace(authz.membership.slug);
  return { ok: true };
}

/** Admins remove members; only the owner removes admins; nobody removes the owner. */
export async function removeWorkspaceMember(input: {
  workspaceId: string;
  userId: string;
}): Promise<WorkspaceActionResult> {
  const authz = await authorizeWorkspace(input?.workspaceId, 'admin');
  if (isError(authz)) return authz;
  if (input.userId === authz.userId) {
    return { ok: false, error: 'Use “Leave workspace” to remove yourself.' };
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
  if (!target) return { ok: false, error: 'Member not found.' };
  if (target.role === 'owner') return { ok: false, error: 'The owner can’t be removed.' };
  if (target.role === 'admin' && authz.membership.role !== 'owner') return FORBIDDEN;

  await db
    .delete(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, input.userId)),
    );
  revalidateWorkspace(authz.membership.slug);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Accepting an emailed workspace invitation (/invite/workspace/[token])
// ---------------------------------------------------------------------------

export type AcceptWorkspaceInviteState = {
  error?: 'Not authenticated' | 'invalid' | 'wrong-account';
};

export async function acceptWorkspaceInvite(
  _prev: AcceptWorkspaceInviteState,
  formData: FormData,
): Promise<AcceptWorkspaceInviteState> {
  const session = await getSession();
  if (!session?.user) return { error: 'Not authenticated' };

  const claims = verifyWorkspaceInvite(((formData.get('token') as string | null) ?? '').trim());
  if (!claims) return { error: 'invalid' };
  if (claims.email.toLowerCase() !== session.user.email.toLowerCase()) {
    return { error: 'wrong-account' };
  }

  const [workspace] = await db
    .select({ slug: workspaces.slug })
    .from(workspaces)
    .where(eq(workspaces.id, claims.workspaceId))
    .limit(1);
  if (!workspace) return { error: 'invalid' };

  try {
    // Existing members keep their role (the unique pair makes this a no-op).
    await db
      .insert(workspaceMembers)
      .values({
        id: crypto.randomUUID(),
        workspaceId: claims.workspaceId,
        userId: session.user.id,
        role: claims.role,
        createdAt: new Date(),
      })
      .onConflictDoNothing();
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }

  revalidatePath('/dashboard', 'layout');
  redirect(`/dashboard/workspaces/${workspace.slug}`);
}
