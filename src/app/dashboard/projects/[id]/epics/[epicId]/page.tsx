// Epic detail. The project layout authorized the viewer; getEpicDetail is
// membership-gated in SQL and scoped to this project, so a foreign or unknown
// epic id is a 404. Its issues may come from sibling projects (cross-project
// epics), each filtered by the viewer's membership in SQL. Initiative choices come from the project's workspace, and
// only when the viewer is a member of that workspace.

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { EpicDetail } from '@/components/epics/epic-detail';
import { getEpicDetail } from '@/lib/epics';
import { documentsForEpic } from '@/lib/documents';
import { getInitiativeOptions } from '@/lib/initiatives';
import { VIEW_COOKIE } from '@/lib/issue-model';
import { getProjectData } from '@/lib/project-data';
import { getSession } from '@/lib/session';
import { getWorkspaceMembership } from '@/lib/workspace-access';

type Params = Promise<{ id: string; epicId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const [{ id, epicId }, session] = await Promise.all([params, getSession()]);
  const detail = session?.user ? await getEpicDetail(id, epicId, session.user.id) : null;
  return { title: detail ? detail.epic.name : 'Epic not found' };
}

export default async function EpicPage({ params }: { params: Params }) {
  const [{ id, epicId }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');
  const userId = session.user.id;

  const [detail, data, cookieStore, docs] = await Promise.all([
    getEpicDetail(id, epicId, userId),
    getProjectData(id, userId),
    cookies(),
    documentsForEpic(epicId, userId),
  ]);
  if (!detail || !data) notFound();

  const workspaceId = data.project.workspaceId;
  const membership = workspaceId ? await getWorkspaceMembership(workspaceId, userId) : null;
  const initiatives = membership ? await getInitiativeOptions(membership.workspaceId) : null;

  return (
    <EpicDetail
      epic={detail.epic}
      milestones={detail.milestones}
      updates={detail.updates}
      issues={detail.issues}
      issueProjects={detail.issueProjects}
      labels={detail.labels}
      relations={detail.relations}
      documents={docs}
      initiatives={initiatives}
      workspaceSlug={membership?.slug ?? null}
      defaultView={cookieStore.get(VIEW_COOKIE)?.value}
    />
  );
}
