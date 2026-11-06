// The viewer's project for a project page that needs its row or role.
//
// The project layout (+layout.server.ts) already 404s non-members, but a
// page's data request can run alongside the layout load, so a page must not
// assume it. Pages that need the layout's project data take it from
// `await parent()`; pages that only need the project row and the viewer's role
// (settings) call this. It reads the same memoized getProjectData lookup, so a
// full page load pays for it once.

import { error } from '@sveltejs/kit';

import { getProjectData } from '@/lib/project-data';
import { requireUser } from '@/lib/session';

export async function loadViewerProject(projectId: string) {
  const user = await requireUser();
  const data = await getProjectData(projectId, user.id);
  if (!data) error(404, 'Not found');
  return { user, project: data.project };
}
