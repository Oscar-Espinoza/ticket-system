// Intake form settings + received customer requests (B11). Every member can
// see the requests; only admins toggle or rotate the public link.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { Inbox } from 'lucide-react';

import { getSession } from '@/lib/session';
import { getMemberProject } from '@/lib/project-access';
import { db } from '@/lib/db';
import { customerRequests, projects, tickets, workflowStates } from '@/db/schema';
import { roleAllows } from '@/lib/roles';
import { issuePath } from '@/lib/issue-links';
import { appUrl } from '@/lib/integrations/app-url';
import { IntakeSettings } from '@/components/integrations/intake-settings';
import { EmptyState, StatusIcon } from '@/components/ui-icons';
import { Separator } from '@/components/ui/separator';

export const metadata: Metadata = { title: 'Intake form' };

const REQUESTS_SHOWN = 50;
const EXCERPT = 180;
const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

export default async function IntakeSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');

  const membership = await getMemberProject(id, session.user.id);
  if (!membership) notFound();

  const [[project], requests] = await Promise.all([
    db
      .select({ intakeToken: projects.intakeToken, triageEnabled: projects.triageEnabled })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1),
    db
      .select({
        id: customerRequests.id,
        name: customerRequests.name,
        email: customerRequests.email,
        body: customerRequests.body,
        createdAt: customerRequests.createdAt,
        number: tickets.ticketNumber,
        title: tickets.title,
        deletedAt: tickets.deletedAt,
        stateName: workflowStates.name,
        stateType: workflowStates.type,
        stateColor: workflowStates.color,
      })
      .from(customerRequests)
      .leftJoin(tickets, eq(customerRequests.ticketId, tickets.id))
      .leftJoin(workflowStates, eq(tickets.stateId, workflowStates.id))
      .where(eq(customerRequests.projectId, id))
      .orderBy(desc(customerRequests.createdAt))
      .limit(REQUESTS_SHOWN),
  ]);
  if (!project) notFound();

  return (
    <>
      <h1 className="text-xl font-medium">Intake form</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        A public form that turns customer requests into issues.
      </p>

      <IntakeSettings
        projectId={id}
        url={project.intakeToken ? `${appUrl()}/request/${project.intakeToken}` : null}
        canEdit={roleAllows(membership.role, 'admin')}
        triageEnabled={project.triageEnabled}
      />

      <Separator className="my-10" />

      <h2 className="text-base font-medium">Requests</h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        The latest {REQUESTS_SHOWN} submissions and the issues they created.
      </p>
      {requests.length === 0 ? (
        <EmptyState
          className="rounded-lg border border-dashed border-border py-10"
          icon={<Inbox />}
          title="No requests yet"
          description={
            project.intakeToken
              ? 'Share the public link — submissions show up here.'
              : 'Turn on the form to start collecting requests.'
          }
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {requests.map((request) => {
            const key = request.number !== null ? `${membership.ticketKey}-${request.number}` : null;
            const excerpt =
              request.body.length > EXCERPT ? `${request.body.slice(0, EXCERPT)}…` : request.body;
            return (
              <li key={request.id} className="flex flex-col gap-1 px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm">
                  {key && request.stateType ? (
                    <Link
                      href={issuePath(id, key)}
                      className="flex min-w-0 items-center gap-2 hover:underline"
                    >
                      <StatusIcon
                        type={request.stateType}
                        color={request.stateColor ?? undefined}
                        aria-label={request.stateName ?? undefined}
                        size={14}
                      />
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">{key}</span>
                      <span className="truncate font-medium">{request.title}</span>
                      {request.deletedAt && (
                        <span className="shrink-0 text-xs text-muted-foreground">(in trash)</span>
                      )}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Issue deleted</span>
                  )}
                  <time
                    dateTime={request.createdAt.toISOString()}
                    className="ml-auto shrink-0 text-xs text-muted-foreground"
                  >
                    {dateFormat.format(request.createdAt)}
                  </time>
                </div>
                <p className="text-xs text-muted-foreground">
                  {request.name ? `${request.name} · ` : ''}
                  {request.email ?? 'No email'}
                </p>
                <p className="line-clamp-2 text-sm text-muted-foreground">{excerpt}</p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
