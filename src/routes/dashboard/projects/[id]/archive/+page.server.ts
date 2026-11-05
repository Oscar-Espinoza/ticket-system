// Archived issues of a project (not in the trash), most recently archived
// first. The project layout already verified membership; the query is
// membership-gated too. (port of src/app/dashboard/projects/[id]/archive/page.tsx)

import { redirect } from '@sveltejs/kit';
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm';

import { tickets } from '@/db/schema';
import { getSession } from '@/lib/session';
import { memberOfIssueProject, queryIssues } from '@/lib/tickets';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const session = await getSession();
  if (!session?.user) redirect(303, '/login');

  const issues = await queryIssues(
    and(
      eq(tickets.projectId, params.id),
      isNotNull(tickets.archivedAt),
      isNull(tickets.deletedAt),
      memberOfIssueProject(session.user.id),
    ),
    { orderBy: [desc(tickets.archivedAt), desc(tickets.ticketNumber)], limit: 1000 },
  );

  return { issues };
};
