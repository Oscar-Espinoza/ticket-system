// Workspace → Audit log: workspace security events (SSO, SCIM, members' 2FA)
// plus the activity of every team in the workspace the viewer administers —
// workspace roles never grant access to a team's data on their own.
// Owners and admins only; non-members 404.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft, ShieldCheck } from 'lucide-react';

import { getSession } from '@/lib/session';
import { getWorkspaceMembership } from '@/lib/workspace-access';
import { resolveAuditScope } from '@/lib/audit';
import { AuditLogView } from '@/components/audit/audit-log-view';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui-icons';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const [{ slug }, session] = await Promise.all([params, getSession()]);
  const membership = session?.user ? await getWorkspaceMembership(slug, session.user.id) : null;
  return { title: membership ? `Audit log · ${membership.name}` : 'Workspace not found' };
}

export default async function WorkspaceAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, query, session] = await Promise.all([params, searchParams, getSession()]);
  if (!session?.user) redirect('/login');
  const membership = await getWorkspaceMembership(slug, session.user.id);
  if (!membership) notFound();

  const scope = await resolveAuditScope('workspace', membership.workspaceId, session.user.id);
  const teamCount = scope?.kind === 'workspace' ? scope.adminProjectIds.length : 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <header className="flex items-start gap-3">
        <Button variant="ghost" size="icon-sm" asChild aria-label="Back to workspace">
          <Link href={`/dashboard/workspaces/${membership.slug}`}>
            <ChevronLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-medium">Audit log</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {scope
              ? `Security events for ${membership.name}, plus activity in the ${teamCount} ${teamCount === 1 ? 'team' : 'teams'} you administer here.`
              : `Security events and team activity for ${membership.name}.`}
          </p>
        </div>
      </header>
      {scope ? (
        <AuditLogView
          scope={scope}
          query={query}
          basePath={`/dashboard/workspaces/${membership.slug}/audit`}
        />
      ) : (
        <EmptyState
          icon={<ShieldCheck />}
          title="Admins only"
          description="Workspace owners and admins can view and export the audit log."
        />
      )}
    </div>
  );
}
