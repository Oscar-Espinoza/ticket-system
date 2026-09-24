// Project issues page. Authorization runs before any project-scoped read;
// ProjectAccessError maps to notFound() so outsiders can't probe project ids (D-15).

import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';

import { getSession } from '@/lib/session';
import { requireProjectMember, ProjectAccessError } from '@/lib/project-access';
import { getProjectMemberOptions, getProjectTickets } from '@/lib/tickets';
import { VIEW_COOKIE, parseIssueFilters } from '@/lib/issue-model';
import { getProjectsForUser } from '@/components/project-list';
import { IssuesView } from '@/components/issues/issues-view';
import { LabelChip } from '@/components/ui-icons';

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;

  const session = await getSession();
  if (!session?.user) {
    redirect('/login');
  }

  try {
    await requireProjectMember(id, session.user.id);
  } catch (err) {
    if (err instanceof ProjectAccessError) notFound();
    throw err;
  }

  const filters = parseIssueFilters(await searchParams);
  const [userProjects, issues, members] = await Promise.all([
    getProjectsForUser(session.user.id),
    getProjectTickets(id, filters),
    getProjectMemberOptions(id),
  ]);
  const project = userProjects.find((p) => p.id === id);
  if (!project) notFound();
  const defaultView = (await cookies()).get(VIEW_COOKIE)?.value;

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
        issues={issues}
        members={members}
        filters={filters}
        totalCount={project.openCount + project.resolvedCount}
        defaultView={defaultView}
      />
    </div>
  );
}
