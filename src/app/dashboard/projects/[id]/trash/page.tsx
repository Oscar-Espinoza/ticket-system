// Trashed (soft-deleted) issues of a project, most recently deleted first.
// Items are purged 30 days after deletion by the project automations (B7).

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { and, desc, eq, isNotNull } from 'drizzle-orm';

import { IssueBin } from '@/components/navigation/issue-bin';
import { tickets } from '@/db/schema';
import { getSession } from '@/lib/session';
import { memberOfIssueProject, queryIssues } from '@/lib/tickets';

export const metadata: Metadata = { title: 'Trash' };

export default async function TrashPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');

  const issues = await queryIssues(
    and(
      eq(tickets.projectId, id),
      isNotNull(tickets.deletedAt),
      memberOfIssueProject(session.user.id),
    ),
    { orderBy: [desc(tickets.deletedAt), desc(tickets.ticketNumber)], limit: 1000 },
  );

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-base font-medium">Trash</h2>
      <IssueBin mode="trash" issues={issues} />
    </div>
  );
}
