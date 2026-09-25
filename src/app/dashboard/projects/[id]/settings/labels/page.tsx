// Project settings › Labels. The project layout already checked membership
// and provides the labels via ProjectDataProvider; this page adds per-label
// counts of active issues. Members and up can manage labels (labels.ts is
// write-level); guests see a read-only list.

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { getSession } from '@/lib/session';
import { getMemberProject } from '@/lib/project-access';
import { db } from '@/lib/db';
import { issueLabels, tickets } from '@/db/schema';
import { roleAllows } from '@/lib/roles';
import { LabelsSettings } from '@/components/settings/labels/labels-settings';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  const project = session?.user ? await getMemberProject(id, session.user.id) : null;
  return { title: project ? `Labels · ${project.name}` : 'Project not found' };
}

export default async function LabelsSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');

  const project = await getMemberProject(id, session.user.id);
  if (!project) notFound();

  const rows = await db
    .select({ labelId: issueLabels.labelId, count: sql<number>`cast(count(*) as int)` })
    .from(issueLabels)
    .innerJoin(tickets, eq(issueLabels.ticketId, tickets.id))
    .where(and(eq(tickets.projectId, id), isNull(tickets.archivedAt), isNull(tickets.deletedAt)))
    .groupBy(issueLabels.labelId);
  const counts = Object.fromEntries(rows.map((row) => [row.labelId, row.count]));
  const canEdit = roleAllows(project.role, 'write');

  return (
    <>
      <h1 className="text-xl font-medium">Labels</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        Labels categorize issues in this project.
        {!canEdit && ' Guests can’t change labels.'}
      </p>
      <LabelsSettings projectId={id} counts={counts} canEdit={canEdit} />
    </>
  );
}
