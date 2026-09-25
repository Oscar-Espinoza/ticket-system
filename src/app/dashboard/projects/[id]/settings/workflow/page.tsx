// Project settings › Workflow. The project layout already checked membership
// and provides the states via ProjectDataProvider; this page adds per-state
// issue counts. Editing is admin-only (the actions re-check).

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';

import { getSession } from '@/lib/session';
import { getMemberProject } from '@/lib/project-access';
import { db } from '@/lib/db';
import { tickets } from '@/db/schema';
import { roleAllows } from '@/lib/roles';
import { WorkflowSettings } from '@/components/settings/workflow/workflow-settings';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  const project = session?.user ? await getMemberProject(id, session.user.id) : null;
  return { title: project ? `Workflow · ${project.name}` : 'Project not found' };
}

export default async function WorkflowSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');

  // Membership first, then the project-scoped count.
  const project = await getMemberProject(id, session.user.id);
  if (!project) notFound();

  // Every issue counts (archived and trashed too): they all block a delete.
  const rows = await db
    .select({ stateId: tickets.stateId, count: sql<number>`cast(count(*) as int)` })
    .from(tickets)
    .where(eq(tickets.projectId, id))
    .groupBy(tickets.stateId);
  const counts = Object.fromEntries(rows.map((row) => [row.stateId, row.count]));
  const canEdit = roleAllows(project.role, 'admin');

  return (
    <>
      <h1 className="text-xl font-medium">Workflow</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        The states issues move through, grouped by type. The type decides how a
        state behaves: started states set a start date, completed and canceled
        states close the issue.
        {!canEdit && ' Only admins can change the workflow.'}
      </p>
      <WorkflowSettings projectId={id} counts={counts} canEdit={canEdit} />
    </>
  );
}
