// Archived issues of a project (not in the trash), most recently archived
// first. The project layout already verified membership; the query is
// membership-gated too.

import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';

import { tickets } from '@/db/schema';
import { requireUser } from '@/lib/session';
import { memberOfIssueProject, queryIssues } from '@/lib/tickets';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const user = await requireUser();

  const issues = await queryIssues(
    and(
      eq(tickets.projectId, params.id),
      isNotNull(tickets.archivedAt),
      isNull(tickets.deletedAt),
      memberOfIssueProject(user.id),
    ),
    { orderBy: [desc(tickets.archivedAt), desc(tickets.ticketNumber)], limit: 1000 },
  );

  return { issues };
};
