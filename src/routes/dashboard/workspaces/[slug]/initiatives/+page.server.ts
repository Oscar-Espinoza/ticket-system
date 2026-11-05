// Workspace initiatives (port of src/app/dashboard/workspaces/[slug]/initiatives/page.tsx).
// Workspace membership gates the page (non-members and unknown slugs get a
// 404); rolled-up progress only counts epics from projects the viewer is a
// member of.

import { error, redirect } from '@sveltejs/kit';

import { getWorkspaceInitiatives, getWorkspaceMemberUsers } from '@/lib/initiatives';
import { getSession } from '@/lib/session';
import { getWorkspaceMembership } from '@/lib/workspace-access';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const session = await getSession();
  if (!session?.user) redirect(303, '/login');
  const membership = await getWorkspaceMembership(params.slug, session.user.id);
  if (!membership) error(404, 'Workspace not found');

  const [initiatives, members] = await Promise.all([
    getWorkspaceInitiatives(membership.workspaceId, session.user.id),
    getWorkspaceMemberUsers(membership.workspaceId),
  ]);

  return {
    workspace: { id: membership.workspaceId, slug: membership.slug, name: membership.name },
    initiatives,
    members,
    viewerId: session.user.id,
  };
};
