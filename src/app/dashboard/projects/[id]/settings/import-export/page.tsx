import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { ImportExportPanel } from '@/components/import/import-export-panel';
import { getMemberProject } from '@/lib/project-access';
import { roleAllows } from '@/lib/roles';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Import / export' };

export default async function ImportExportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');
  const membership = await getMemberProject(id, session.user.id);
  if (!membership) notFound();

  return (
    <>
      <h1 className="text-xl font-medium">Import / export</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        Move issues in from CSV, Jira, GitHub Issues, Asana or Shortcut, or take them out as CSV / JSON.
      </p>
      <ImportExportPanel projectId={id} canImport={roleAllows(membership.role, 'write')} />
    </>
  );
}
