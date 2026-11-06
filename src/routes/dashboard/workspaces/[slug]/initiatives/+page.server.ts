// Workspace initiatives.
// Workspace membership gates the page (non-members and unknown slugs get a
// 404); rolled-up progress only counts epics from projects the viewer is a
// member of.

import { error } from '@sveltejs/kit';

import { getWorkspaceInitiatives, getWorkspaceMemberUsers } from '@/lib/initiatives';
import { requireUser } from '@/lib/session';
import { getWorkspaceMembership } from '@/lib/workspace-access';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const user = await requireUser();
  const membership = await getWorkspaceMembership(params.slug, user.id);
  if (!membership) error(404, 'Workspace not found');

  const [initiatives, members] = await Promise.all([
    getWorkspaceInitiatives(membership.workspaceId, user.id),
    getWorkspaceMemberUsers(membership.workspaceId),
  ]);

  return {
    workspace: { id: membership.workspaceId, slug: membership.slug, name: membership.name },
    initiatives,
    members,
    viewerId: user.id,
  };
};
