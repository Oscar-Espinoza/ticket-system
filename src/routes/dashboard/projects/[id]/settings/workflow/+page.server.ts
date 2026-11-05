// Project settings › Workflow. The project layout already checked membership
// and provides the states via ProjectDataProvider; this page adds per-state
// issue counts. Editing is admin-only (the actions re-check).

import { error, redirect } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';

import { tickets } from '@/db/schema';
import { db } from '@/lib/db';
import { getMemberProject } from '@/lib/project-access';
import { roleAllows } from '@/lib/roles';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const { id } = params;
  if (!locals.user) redirect(303, '/login');

  // Membership first, then the project-scoped count.
  const project = await getMemberProject(id, locals.user.id);
  if (!project) error(404, 'Not found');

  // Every issue counts (archived and trashed too): they all block a delete.
  const rows = await db
    .select({ stateId: tickets.stateId, count: sql<number>`cast(count(*) as int)` })
    .from(tickets)
    .where(eq(tickets.projectId, id))
    .groupBy(tickets.stateId);

  return {
    projectId: id,
    projectName: project.name,
    counts: Object.fromEntries(rows.map((row) => [row.stateId, row.count])) as Record<
      string,
      number
    >,
    canEdit: roleAllows(project.role, 'admin'),
  };
};
