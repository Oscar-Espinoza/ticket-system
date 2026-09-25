// Project settings › Audit log: every recorded event for this team (issue and
// comment activity, member / role / settings changes) plus its workspace's
// security events. Owners and admins only; non-members 404.

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';

import { getSession } from '@/lib/session';
import { getMemberProject } from '@/lib/project-access';
import { resolveAuditScope } from '@/lib/audit';
import { projectHref } from '@/components/app-shell/routes';
import { AuditLogView } from '@/components/audit/audit-log-view';
import { EmptyState } from '@/components/ui-icons';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  const project = session?.user ? await getMemberProject(id, session.user.id) : null;
  return { title: project ? `Audit log · ${project.name}` : 'Project not found' };
}

export default async function ProjectAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query, session] = await Promise.all([params, searchParams, getSession()]);
  if (!session?.user) redirect('/login');
  const project = await getMemberProject(id, session.user.id);
  if (!project) notFound();

  const scope = await resolveAuditScope('project', id, session.user.id);

  return (
    <>
      <h1 className="text-xl font-medium">Audit log</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        Who changed what in {project.name}. Export it as CSV or JSON (up to 50,000 events).
      </p>
      {scope ? (
        <AuditLogView scope={scope} query={query} basePath={projectHref(id, 'settings/audit')} />
      ) : (
        <EmptyState
          icon={<ShieldCheck />}
          title="Admins only"
          description="Team owners and admins can view and export the audit log."
        />
      )}
    </>
  );
}
