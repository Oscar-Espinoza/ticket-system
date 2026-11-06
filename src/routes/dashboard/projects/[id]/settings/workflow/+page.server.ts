// Project settings › Workflow. The project layout already checked membership
// and provides the states via ProjectDataProvider; this page adds per-state
// issue counts. Editing is admin-only (the actions re-check).

import { eq, sql } from 'drizzle-orm';

import { tickets } from '@/db/schema';
import { db } from '@/lib/db';
import { roleAllows } from '@/lib/roles';
import { loadViewerProject } from '../../project-load';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const { id } = params;
  const { project } = await loadViewerProject(id);

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
