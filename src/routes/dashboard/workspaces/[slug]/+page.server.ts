// Workspace page: its
// projects ("teams") and members. Members only — anyone else gets a 404, so
// slugs can't be probed. Project names and keys are visible to every workspace
// member; issue counts only for projects the viewer belongs to.

import { error } from '@sveltejs/kit';
import { getWorkspaceMembership, workspaceInviteUrl } from '@/lib/workspace-access';
import { getWorkspacePage } from '@/lib/workspace-page-read';
import { workspaceRoleAllows } from '@/lib/workspace-types';
import { requireUser } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const { id: userId } = await requireUser();

  const membership = await getWorkspaceMembership(params.slug, userId);
  if (!membership) error(404, 'Workspace not found');
  const workspaceId = membership.workspaceId;

  const isAdmin = workspaceRoleAllows(membership.role, 'admin');

  const [projectRows, openRows, memberRows, eligibleRows, invitationRows] = await getWorkspacePage(
    workspaceId,
    userId,
    isAdmin,
  );

  const openByProject = new Map(openRows.map((row) => [row.projectId, row.count]));
  const projectList = projectRows.map((project) => ({
    ...project,
    openCount: project.viewerRole ? (openByProject.get(project.id) ?? 0) : null,
  }));
  const invitations = invitationRows.map(({ token, expiresAt, ...row }) => ({
    ...row,
    expiresAt: expiresAt.toISOString(),
    url: workspaceInviteUrl(token),
  }));

  return {
    viewerId: userId,
    membership: {
      workspaceId,
      name: membership.name,
      slug: membership.slug,
      role: membership.role,
    },
    projects: projectList,
    eligible: isAdmin ? eligibleRows : [],
    members: memberRows,
    invitations,
  };
};
