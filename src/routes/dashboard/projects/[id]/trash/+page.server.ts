// Trashed (soft-deleted) issues of a project, most recently deleted first.
// Items are purged 30 days after deletion by the project automations (B7).
// (port of src/app/dashboard/projects/[id]/trash/page.tsx)

import { redirect } from '@sveltejs/kit';
import { and, desc, eq, isNotNull } from 'drizzle-orm';

import { tickets } from '@/db/schema';
import { getSession } from '@/lib/session';
import { memberOfIssueProject, queryIssues } from '@/lib/tickets';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const session = await getSession();
  if (!session?.user) redirect(303, '/login');

  const issues = await queryIssues(
    and(eq(tickets.projectId, params.id), isNotNull(tickets.deletedAt), memberOfIssueProject(session.user.id)),
    { orderBy: [desc(tickets.deletedAt), desc(tickets.ticketNumber)], limit: 1000 },
  );

  return { issues };
};
