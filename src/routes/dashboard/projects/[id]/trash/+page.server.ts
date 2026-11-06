// Trashed (soft-deleted) issues of a project, most recently deleted first.
// Items are purged 30 days after deletion by the project automations.

import { and, desc, eq, isNotNull } from 'drizzle-orm';

import { tickets } from '@/db/schema';
import { requireUser } from '@/lib/session';
import { memberOfIssueProject, queryIssues } from '@/lib/tickets';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const user = await requireUser();

  const issues = await queryIssues(
    and(eq(tickets.projectId, params.id), isNotNull(tickets.deletedAt), memberOfIssueProject(user.id)),
    { orderBy: [desc(tickets.deletedAt), desc(tickets.ticketNumber)], limit: 1000 },
  );

  return { issues };
};
