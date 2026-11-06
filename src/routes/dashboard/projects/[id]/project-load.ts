// The viewer's project for a project page that needs only its name, key and
// the viewer's role (settings).
//
// The project layout (+layout.server.ts) already 404s non-members, but a
// page's data request can run alongside the layout load, so a page must not
// assume it. Pages that need the layout's project data take it from
// `await parent()`. This is one memoized single-row membership query, so a
// client navigation between settings pages doesn't re-run the layout's
// multi-query project load.

import { error } from '@sveltejs/kit';

import { getMemberProject } from '@/lib/project-access';
import { requireUser } from '@/lib/session';

export async function loadViewerProject(projectId: string) {
  const user = await requireUser();
  const project = await getMemberProject(projectId, user.id);
  if (!project) error(404, 'Not found');
  return { user, project };
}
