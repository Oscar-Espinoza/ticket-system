// Archived issues of a project (not in the trash), most recently archived
// first. The project layout already verified membership; the query is
// membership-gated too.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';

import { IssueBin } from '@/components/navigation/issue-bin';
import { tickets } from '@/db/schema';
import { getSession } from '@/lib/session';
import { memberOfIssueProject, queryIssues } from '@/lib/tickets';

export const metadata: Metadata = { title: 'Archive' };

export default async function ArchivePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');

  const issues = await queryIssues(
    and(
      eq(tickets.projectId, id),
      isNotNull(tickets.archivedAt),
      isNull(tickets.deletedAt),
      memberOfIssueProject(session.user.id),
    ),
    { orderBy: [desc(tickets.archivedAt), desc(tickets.ticketNumber)], limit: 1000 },
  );

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-medium">Archive</h2>
      <IssueBin mode="archive" issues={issues} />
    </div>
  );
}
