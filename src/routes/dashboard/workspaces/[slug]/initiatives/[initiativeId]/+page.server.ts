// Initiative detail.
// Workspace membership gates the page; the initiative must belong to that
// workspace (404 otherwise). Linked epics are limited to projects the viewer
// is a member of.

import { error } from '@sveltejs/kit';

import { getInitiativeDetail } from '@/lib/initiatives';
import { requireUser } from '@/lib/session';
import { getWorkspaceMembership } from '@/lib/workspace-access';
import { workspaceRoleAllows } from '@/lib/workspace-types';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const { slug, initiativeId } = params;
  const user = await requireUser();
  const membership = await getWorkspaceMembership(slug, user.id);
  const detail = membership
    ? await getInitiativeDetail(membership.workspaceId, initiativeId, user.id)
    : null;
  if (!membership || !detail) error(404, 'Initiative not found');

  const canDelete =
    workspaceRoleAllows(membership.role, 'admin') || detail.initiative.owner?.id === user.id;

  return {
    workspace: { id: membership.workspaceId, slug: membership.slug, name: membership.name },
    detail,
    viewerId: user.id,
    canDelete,
  };
};
