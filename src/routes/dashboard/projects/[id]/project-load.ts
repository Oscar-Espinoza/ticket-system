// The viewer's project for a project page that needs only its name, key and
// the viewer's role (settings), and the shared result of a feature page whose
// feature is off.
//
// The project layout (+layout.server.ts) already 404s non-members, but a
// page's data request can run alongside the layout load, so a page must not
// assume it. Pages that need the layout's project data take it from
// `await parent()`. This is one memoized single-row membership query, so a
// client navigation between settings pages doesn't re-run the layout's
// multi-query project load.

import { error } from '@sveltejs/kit';

import { getMemberProject } from '@/lib/project-access';
import { roleAllows, type ProjectRole } from '@/lib/roles';
import { requireUser } from '@/lib/session';

export async function loadViewerProject(projectId: string) {
  const user = await requireUser();
  const project = await getMemberProject(projectId, user.id);
  if (!project) error(404, 'Not found');
  return { user, project };
}

/** The load result of a feature page whose feature is off and has nothing left to show. */
export function featureOff(projectId: string, role: ProjectRole) {
  return {
    featureOff: true as const,
    projectId,
    canEnable: roleAllows(role, 'admin'),
  };
}
