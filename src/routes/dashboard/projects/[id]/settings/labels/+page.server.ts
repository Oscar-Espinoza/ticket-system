// Project settings › Labels. The project layout already checked membership
// and provides the labels via ProjectDataProvider; this page adds per-label
// counts of active issues. Members and up can manage labels (labels.ts is
// write-level); guests see a read-only list.

import { error, redirect } from '@sveltejs/kit';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { issueLabels, tickets } from '@/db/schema';
import { db } from '@/lib/db';
import { getMemberProject } from '@/lib/project-access';
import { roleAllows } from '@/lib/roles';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const { id } = params;
  if (!locals.user) redirect(303, '/login');

  const project = await getMemberProject(id, locals.user.id);
  if (!project) error(404, 'Not found');

  const rows = await db
    .select({ labelId: issueLabels.labelId, count: sql<number>`cast(count(*) as int)` })
    .from(issueLabels)
    .innerJoin(tickets, eq(issueLabels.ticketId, tickets.id))
    .where(and(eq(tickets.projectId, id), isNull(tickets.archivedAt), isNull(tickets.deletedAt)))
    .groupBy(issueLabels.labelId);

  return {
    projectId: id,
    projectName: project.name,
    counts: Object.fromEntries(rows.map((row) => [row.labelId, row.count])) as Record<
      string,
      number
    >,
    canEdit: roleAllows(project.role, 'write'),
  };
};
