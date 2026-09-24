// Project issues page. The project layout already authorized the viewer and
// provides project data; getProjectIssues is membership-gated in SQL too.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { IssuesView } from '@/components/issues/issues-view';
import { VIEW_COOKIE } from '@/lib/issue-model';
import { getSession } from '@/lib/session';
import { getProjectIssues } from '@/lib/tickets';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');

  // All active issues load once, so view and filter changes are purely
  // client-side afterwards.
  const [issues, cookieStore] = await Promise.all([
    getProjectIssues(id, session.user.id),
    cookies(),
  ]);

  return <IssuesView issues={issues} defaultView={cookieStore.get(VIEW_COOKIE)?.value} />;
}
