// Workspace membership authorization — the workspace counterpart of
// project-access.ts. Server-only. Workspace membership grants access to the
// workspace page and its initiatives; project data still requires project
// membership (requireProjectMember).

import { randomBytes } from 'node:crypto';
import { cache } from 'react';
import { and, asc, eq, gt, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { workspaceInvitations, workspaceMembers, workspaces } from '@/db/schema';

export type WorkspaceRole = 'owner' | 'admin' | 'member';

export type WorkspaceMembership = {
  workspaceId: string;
  slug: string;
  name: string;
  userId: string;
  role: WorkspaceRole;
};

export class WorkspaceAccessError extends Error {
  constructor(message = 'Not a workspace member') {
    super(message);
    this.name = 'WorkspaceAccessError';
  }
}

/** Membership by workspace slug or id; null for non-members (enumeration-safe). */
export const getWorkspaceMembership = cache(
  async (slugOrId: string, userId: string): Promise<WorkspaceMembership | null> => {
    if (!slugOrId || !userId) return null;
    const bySlug = eq(workspaces.slug, slugOrId);
    const byId = eq(workspaces.id, slugOrId);
    for (const match of [bySlug, byId]) {
      const [row] = await db
        .select({
          workspaceId: workspaces.id,
          slug: workspaces.slug,
          name: workspaces.name,
          userId: workspaceMembers.userId,
          role: workspaceMembers.role,
        })
        .from(workspaceMembers)
        .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
        .where(and(match, eq(workspaceMembers.userId, userId)))
        .limit(1);
      if (row) return row;
    }
    return null;
  },
);

export async function requireWorkspaceMember(
  slugOrId: string,
  userId: string,
): Promise<WorkspaceMembership> {
  const membership = await getWorkspaceMembership(slugOrId, userId);
  if (!membership) throw new WorkspaceAccessError();
  return membership;
}

export async function requireWorkspaceAdmin(
  slugOrId: string,
  userId: string,
): Promise<WorkspaceMembership> {
  const membership = await requireWorkspaceMember(slugOrId, userId);
  if (membership.role === 'member') {
    throw new WorkspaceAccessError('Not a workspace admin');
  }
  return membership;
}

export interface UserWorkspace {
  id: string;
  slug: string;
  name: string;
  role: WorkspaceRole;
}

/** Workspaces the user belongs to, by name. Memoized per request (sidebar + pages). */
export const getUserWorkspaces = cache(async (userId: string): Promise<UserWorkspace[]> => {
  if (!userId) return [];
  return db
    .select({
      id: workspaces.id,
      slug: workspaces.slug,
      name: workspaces.name,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(asc(workspaces.name));
});

// ---------------------------------------------------------------------------
// Workspace email invitations (workspace_invitation rows)
// ---------------------------------------------------------------------------
// Single use, 7 days, one pending row per (workspace, email). Accepting needs
// the signed-in email to match — see acceptWorkspaceInvite.

export type WorkspaceInviteRole = Exclude<WorkspaceRole, 'owner'>;

export const WORKSPACE_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const newWorkspaceInviteToken = () => randomBytes(32).toString('base64url');

export const workspaceInviteUrl = (token: string) =>
  `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/invite/workspace/${token}`;

export interface PendingWorkspaceInvite {
  id: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: WorkspaceInviteRole;
}

/** An unexpired, unaccepted invitation by token — null for anything else. */
export async function getPendingWorkspaceInvite(
  token: string,
): Promise<PendingWorkspaceInvite | null> {
  if (typeof token !== 'string' || !token || token.length > 128) return null;
  const [row] = await db
    .select({
      id: workspaceInvitations.id,
      workspaceId: workspaceInvitations.workspaceId,
      workspaceName: workspaces.name,
      email: workspaceInvitations.email,
      role: workspaceInvitations.role,
    })
    .from(workspaceInvitations)
    .innerJoin(workspaces, eq(workspaceInvitations.workspaceId, workspaces.id))
    .where(
      and(
        eq(workspaceInvitations.token, token),
        isNull(workspaceInvitations.acceptedAt),
        gt(workspaceInvitations.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}
