import { error } from '@sveltejs/kit';

import { getGeneralSettings, getWorkspaceProjectsForViewer } from '@/lib/project-settings-read';
import { roleAllows } from '@/lib/roles';
import { getUserWorkspaces } from '@/lib/workspace-access';
import { loadViewerProject } from '../../project-load';
import type { PageServerLoad } from './$types';

/** Ids of `rootId` and every project below it (sub-teams can't become parents). */
function subtree(rootId: string, rows: { id: string; parentId: string | null }[]): Set<string> {
  const ids = new Set([rootId]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const row of rows) {
      if (row.parentId && ids.has(row.parentId) && !ids.has(row.id)) {
        ids.add(row.id);
        grew = true;
      }
    }
  }
  return ids;
}

export const load: PageServerLoad = async ({ params }) => {
  const { id } = params;
  const { user, project: membership } = await loadViewerProject(id);
  const userId = user.id;
  const [project, userWorkspaces] = await Promise.all([getGeneralSettings(id), getUserWorkspaces(userId)]);
  if (!project) error(404, 'Not found');

  // Candidate parents: same workspace, viewer is a member, not in our subtree.
  // Names of teams the viewer isn't in stay hidden, except the current parent.
  const siblings = project.workspaceId ? await getWorkspaceProjectsForViewer(project.workspaceId, userId) : [];
  const excluded = subtree(id, siblings);
  const parentOptions = siblings
    .filter((p) => !excluded.has(p.id) && (p.member !== null || p.id === project.parentId))
    .map(({ id: optionId, name, ticketKey }) => ({ id: optionId, name, ticketKey }));

  return {
    projectId: id,
    projectName: membership.name,
    name: project.name,
    ticketKey: project.ticketKey,
    description: project.description ?? '',
    estimateScale: project.estimateScale,
    canEdit: roleAllows(membership.role, 'admin'),
    isOwner: membership.role === 'owner',
    workspaceId: project.workspaceId,
    workspaceName: project.workspaceName,
    parentId: parentOptions.some((p) => p.id === project.parentId) ? project.parentId : null,
    parentOptions,
    visibility: (project.visibility === 'workspace' ? 'workspace' : 'private') as
      | 'workspace'
      | 'private',
    templateWorkspaces: userWorkspaces.map((w) => ({ id: w.id, name: w.name })),
  };
};
