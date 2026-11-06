// Workspace invitation landing page. PUBLIC route. The token names a
// pending workspace_invitation row (src/lib/workspace-access.ts): unknown,
// expired, revoked or used tokens all get the same generic message; a
// signed-in user with a different email sees why they can't accept. Joining is
// the explicit POST in acceptWorkspaceInvite.

import { getPendingWorkspaceInvite } from '@/lib/workspace-access';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const token = params.token;
  const invite = await getPendingWorkspaceInvite(token);
  return {
    token,
    /** The segment as it appears in the URL (the raw `params.token`). */
    rawToken: encodeURIComponent(token),
    invite: invite ? { email: invite.email, role: invite.role, workspaceName: invite.workspaceName } : null,
    user: locals.user ? { email: locals.user.email } : null,
  };
};
