// The authorization seam for project-scoped server actions and route handlers
// that run with a browser session: session → membership → role level.
//
// Roles → levels (src/lib/roles.ts): owner/admin → admin, member → write,
// guest → read + comment. Built on requireProjectMember so the membership
// check stays in one place (project-access.ts).
//
// Session-less callers (API keys, webhooks, automations) don't use this; they
// authorize their own way and then call src/lib/issue-service.ts directly.

import { ProjectAccessError, requireProjectMember } from '@/lib/project-access';
import { roleAllows, type AccessLevel, type ProjectRole } from '@/lib/roles';
import { FORBIDDEN, NOT_AUTHENTICATED, type AuthFail } from '@/lib/server/action-kit';
import { getSession } from '@/lib/session';

export type { AccessLevel, ProjectRole };
export { roleAllows };

export type ProjectActionAuth = { ok: true; userId: string; role: ProjectRole } | AuthFail;

export async function authorizeProjectAction(
  projectId: unknown,
  level: AccessLevel,
): Promise<ProjectActionAuth> {
  const session = await getSession();
  if (!session?.user) return NOT_AUTHENTICATED;
  // projectId is untrusted client input.
  if (typeof projectId !== 'string' || !projectId) return FORBIDDEN;

  try {
    const membership = await requireProjectMember(projectId, session.user.id);
    if (!roleAllows(membership.role, level)) return FORBIDDEN;
    return { ok: true, userId: session.user.id, role: membership.role };
  } catch (err) {
    if (err instanceof ProjectAccessError) return FORBIDDEN;
    throw err;
  }
}
