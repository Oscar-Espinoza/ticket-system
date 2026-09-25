// Workspace membership authorization — the workspace counterpart of
// project-access.ts. Server-only. Workspace membership grants access to the
// workspace page and its initiatives; project data still requires project
// membership (requireProjectMember).

import { createHmac, timingSafeEqual } from 'node:crypto';
import { cache } from 'react';
import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { workspaceMembers, workspaces } from '@/db/schema';

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
// Workspace email invitations — stateless signed tokens
// ---------------------------------------------------------------------------
// There is no workspace_invitation table, so the invite link carries its own
// claims ({workspaceId, email, role, exp}) signed with HMAC-SHA256 under
// BETTER_AUTH_SECRET. Accepting requires the signed-in email to match. Such
// links can't be listed or revoked and stay usable until they expire (joining
// is idempotent) — see .planning/features/B9-workspaces.md.

export type WorkspaceInviteRole = Exclude<WorkspaceRole, 'owner'>;

export interface WorkspaceInviteClaims {
  workspaceId: string;
  email: string;
  role: WorkspaceInviteRole;
  /** Expiry, ms since epoch. */
  exp: number;
}

export const WORKSPACE_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function inviteSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required to sign workspace invitations');
  return secret;
}

function mac(payload: string): string {
  return createHmac('sha256', inviteSecret())
    .update(`workspace-invite:${payload}`)
    .digest('base64url');
}

export function signWorkspaceInvite(claims: WorkspaceInviteClaims): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${mac(payload)}`;
}

/** Valid, unexpired claims — or null for anything tampered, malformed or stale. */
export function verifyWorkspaceInvite(token: string): WorkspaceInviteClaims | null {
  if (typeof token !== 'string') return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(mac(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (
      typeof claims?.workspaceId !== 'string' ||
      typeof claims.email !== 'string' ||
      (claims.role !== 'admin' && claims.role !== 'member') ||
      typeof claims.exp !== 'number' ||
      claims.exp <= Date.now()
    ) {
      return null;
    }
    return claims as WorkspaceInviteClaims;
  } catch {
    return null;
  }
}
