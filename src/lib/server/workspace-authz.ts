// Who is calling a workspace action: session → workspace membership → minimum
// role. Workspace counterpart of authorizeProjectAction (src/lib/action-auth.ts).

import { FORBIDDEN, NOT_AUTHENTICATED, type AuthFail } from '@/lib/server/action-kit';
import { sessionUserId } from '@/lib/session';
import { getWorkspaceMembership, type WorkspaceMembership } from '@/lib/workspace-access';
import { workspaceRoleAllows, type WorkspaceRole } from '@/lib/workspace-types';

export type WorkspaceActionAuth = { ok: true; userId: string; membership: WorkspaceMembership } | AuthFail;

/** Takes a workspace id only: the lookup also matches slugs, so a slug (its workspace id differs) is refused. */
export async function authorizeWorkspaceAction(
  workspaceId: unknown,
  min: WorkspaceRole,
): Promise<WorkspaceActionAuth> {
  const userId = await sessionUserId();
  if (!userId) return NOT_AUTHENTICATED;
  if (typeof workspaceId !== 'string' || !workspaceId) return FORBIDDEN;
  const membership = await getWorkspaceMembership(workspaceId, userId);
  if (!membership || membership.workspaceId !== workspaceId) return FORBIDDEN;
  if (!workspaceRoleAllows(membership.role, min)) return FORBIDDEN;
  return { ok: true, userId, membership };
}
