// Epic detail (port of src/app/dashboard/projects/[id]/epics/[epicId]/page.tsx).
// The project layout authorized the viewer; getEpicDetail is membership-gated
// in SQL and scoped to this project, so a foreign or unknown epic id is a 404.
// Its issues may come from sibling projects (cross-project epics), each
// filtered by the viewer's membership in SQL. Initiative choices come from the
// project's workspace, and only when the viewer is a member of that workspace.

import { error, redirect } from '@sveltejs/kit';

import { documentsForEpic } from '@/lib/documents';
import { getEpicDetail } from '@/lib/epics';
import { getInitiativeOptions } from '@/lib/initiatives';
import { VIEW_COOKIE } from '@/lib/issue-model';
import { getProjectData } from '@/lib/project-data';
import { getSession } from '@/lib/session';
import { getWorkspaceMembership } from '@/lib/workspace-access';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, cookies }) => {
  const { id, epicId } = params;
  const session = await getSession();
  if (!session?.user) redirect(303, '/login');
  const userId = session.user.id;

  const [detail, data, docs] = await Promise.all([
    getEpicDetail(id, epicId, userId),
    getProjectData(id, userId),
    documentsForEpic(epicId, userId),
  ]);
  if (!detail || !data) error(404, 'Epic not found');

  const workspaceId = data.project.workspaceId;
  const membership = workspaceId ? await getWorkspaceMembership(workspaceId, userId) : null;
  const initiatives = membership ? await getInitiativeOptions(membership.workspaceId) : null;

  return {
    epic: detail.epic,
    milestones: detail.milestones,
    updates: detail.updates,
    issues: detail.issues,
    issueProjects: detail.issueProjects,
    labels: detail.labels,
    relations: detail.relations,
    documents: docs,
    initiatives,
    workspaceSlug: membership?.slug ?? null,
    defaultView: cookies.get(VIEW_COOKIE),
  };
};
