// Project issues page. Membership is checked before any project-scoped read;
// non-members get notFound() so outsiders can't probe project ids (D-15).

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

import { getSession } from '@/lib/session';
import { getProjectView } from '@/lib/tickets';
import { VIEW_COOKIE } from '@/lib/issue-model';
import { IssuesView } from '@/components/issues/issues-view';
import { LabelChip } from '@/components/ui-icons';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  const view = session?.user ? await getProjectView(id, session.user.id) : null;
  return { title: view ? view.project.name : 'Project not found' };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) {
    redirect('/login');
  }

  // One DB round trip; all tickets load once, so view and filter changes are
  // purely client-side afterwards.
  const [view, cookieStore] = await Promise.all([
    getProjectView(id, session.user.id),
    cookies(),
  ]);
  if (!view) notFound();
  const { project, issues, members } = view;

  return (
    <div className="flex min-h-full flex-col">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="truncate text-xl font-medium">{project.name}</h1>
        <LabelChip dot={false} className="font-mono">
          {project.ticketKey}
        </LabelChip>
        <Link
          href={`/dashboard/projects/${id}/members`}
          className="ml-auto rounded text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Members
        </Link>
      </div>

      <IssuesView
        projectId={id}
        ticketKey={project.ticketKey}
        issues={issues}
        members={members}
        defaultView={cookieStore.get(VIEW_COOKIE)?.value}
      />
    </div>
  );
}
