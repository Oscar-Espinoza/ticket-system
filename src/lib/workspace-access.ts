// Workspace membership authorization — the workspace counterpart of
// project-access.ts. Server-only. Workspace membership grants access to the
// workspace page and its initiatives; project data still requires project
// membership (requireProjectMember).

import { cache } from 'react';
import { and, eq } from 'drizzle-orm';

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
