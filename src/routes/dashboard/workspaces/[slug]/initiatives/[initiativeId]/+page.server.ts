// Initiative detail (port of
// src/app/dashboard/workspaces/[slug]/initiatives/[initiativeId]/page.tsx).
// Workspace membership gates the page; the initiative must belong to that
// workspace (404 otherwise). Linked epics are limited to projects the viewer
// is a member of.

import { error, redirect } from '@sveltejs/kit';

import { getInitiativeDetail } from '@/lib/initiatives';
import { getSession } from '@/lib/session';
import { getWorkspaceMembership } from '@/lib/workspace-access';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const { slug, initiativeId } = params;
  const session = await getSession();
  if (!session?.user) redirect(303, '/login');
  const membership = await getWorkspaceMembership(slug, session.user.id);
  const detail = membership
    ? await getInitiativeDetail(membership.workspaceId, initiativeId, session.user.id)
    : null;
  if (!membership || !detail) error(404, 'Initiative not found');

  const canDelete =
    membership.role !== 'member' || detail.initiative.owner?.id === session.user.id;

  return {
    workspace: { id: membership.workspaceId, slug: membership.slug, name: membership.name },
    detail,
    viewerId: session.user.id,
    canDelete,
  };
};
