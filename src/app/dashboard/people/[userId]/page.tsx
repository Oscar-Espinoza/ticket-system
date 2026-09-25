// Member profile. Visible to the person themselves and to anyone who shares at
// least one project with them; everyone else gets notFound() (no probing user
// ids). Everything shown — projects, assigned issues, activity — is limited to
// projects the viewer is a member of.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, desc, eq, inArray, notInArray } from 'drizzle-orm';
import { Activity, CircleDot, FolderKanban, Pencil } from 'lucide-react';

import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { activities, projects, tickets, userProfiles, users, workflowStates } from '@/db/schema';
import { getSharedProjects } from '@/lib/project-access';
import { activeIssue, memberOfIssueProject, queryIssues } from '@/lib/tickets';
import { issuePath } from '@/lib/issue-links';
import { Avatar, EmptyState, LabelChip, PriorityIcon, StateIcon } from '@/components/ui-icons';
import { Button } from '@/components/ui/button';
import { PROJECT_ROLE_LABEL } from '@/components/workspaces/role-rules';
import { LocalTime } from '@/components/people/local-time';
import { activitySummary } from '@/components/people/activity-summary';

type Params = { params: Promise<{ userId: string }> };

async function loadAccess(userId: string) {
  const session = await getSession();
  if (!session?.user) return null;
  const viewerId = session.user.id;
  const shared = await getSharedProjects(viewerId, userId);
  if (viewerId !== userId && shared.length === 0) return { viewerId, shared, allowed: false };
  return { viewerId, shared, allowed: true };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { userId } = await params;
  const access = await loadAccess(userId);
  if (!access?.allowed) return { title: 'Profile not found' };
  const [user] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return { title: user?.name ?? 'Profile' };
}

const dateFormat = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' });

/** Relative to the server's request time (the page renders per request). */
function ago(date: Date, now = Date.now()): string {
  const minutes = Math.round((date.getTime() - now) / 60_000);
  if (Math.abs(minutes) < 60) return minutes === 0 ? 'just now' : rtf.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) return rtf.format(days, 'day');
  return dateFormat.format(date);
}

export default async function PersonPage({ params }: Params) {
  const { userId } = await params;
  const access = await loadAccess(userId);
  if (!access) redirect('/login');
  if (!access.allowed) notFound();
  const { viewerId, shared } = access;
  const isSelf = viewerId === userId;
  const sharedIds = shared.map((project) => project.id);

  const [[person], recent, assigned] = await Promise.all([
    db
      .select({
        name: users.name,
        email: users.email,
        image: users.image,
        title: userProfiles.title,
        bio: userProfiles.bio,
        timezone: userProfiles.timezone,
      })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1),
    sharedIds.length === 0
      ? []
      : db
          .select({
            id: activities.id,
            type: activities.type,
            data: activities.data,
            createdAt: activities.createdAt,
            ticketId: activities.ticketId,
            projectId: activities.projectId,
            projectName: projects.name,
            ticketKey: projects.ticketKey,
            number: tickets.ticketNumber,
            title: tickets.title,
            deletedAt: tickets.deletedAt,
          })
          .from(activities)
          .innerJoin(projects, eq(activities.projectId, projects.id))
          .leftJoin(tickets, eq(activities.ticketId, tickets.id))
          .where(and(eq(activities.actorId, userId), inArray(activities.projectId, sharedIds)))
          .orderBy(desc(activities.createdAt))
          .limit(20),
    queryIssues(
      and(
        eq(tickets.assigneeId, userId),
        memberOfIssueProject(viewerId),
        activeIssue(),
        notInArray(workflowStates.type, ['completed', 'canceled']),
      ),
      { limit: 50, orderBy: [desc(tickets.updatedAt)] },
    ),
  ]);
  if (!person) notFound();

  const projectNames = new Map(shared.map((project) => [project.id, project.name]));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10">
      <header className="flex items-start gap-4">
        <Avatar
          name={person.name}
          src={person.image}
          className="data-[size=sm]:size-16 [&_[data-slot=avatar-fallback]]:text-lg"
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-medium">{person.name}</h1>
          {person.title && <p className="text-sm">{person.title}</p>}
          <p className="mt-1 truncate text-sm text-muted-foreground">{person.email}</p>
          {person.timezone && (
            <p className="mt-1 text-sm text-muted-foreground">
              <LocalTime timeZone={person.timezone} />
            </p>
          )}
        </div>
        {isSelf && (
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/settings/profile">
              <Pencil />
              Edit profile
            </Link>
          </Button>
        )}
      </header>

      {person.bio && (
        <p className="-mt-4 text-sm leading-relaxed whitespace-pre-line">{person.bio}</p>
      )}

      <section aria-labelledby="person-projects">
        <h2 id="person-projects" className="mb-3 text-base font-medium">
          {isSelf ? 'Your projects' : 'Shared projects'}{' '}
          <span className="text-muted-foreground">· {shared.length}</span>
        </h2>
        {shared.length === 0 ? (
          <EmptyState
            className="rounded-lg border py-8"
            icon={<FolderKanban />}
            title="No projects yet"
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border/60 rounded-lg border">
            {shared.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/dashboard/projects/${project.id}`}
                  className="flex min-h-10 items-center gap-2.5 px-3 py-2 outline-none hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <LabelChip dot={false} className="font-mono">
                    {project.ticketKey}
                  </LabelChip>
                  <span className="min-w-0 flex-1 truncate text-sm">{project.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {PROJECT_ROLE_LABEL[project.role]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="person-issues">
        <h2 id="person-issues" className="mb-3 text-base font-medium">
          Assigned issues <span className="text-muted-foreground">· {assigned.length}</span>
        </h2>
        {assigned.length === 0 ? (
          <EmptyState
            className="rounded-lg border py-8"
            icon={<CircleDot />}
            title="No open issues"
            description={
              isSelf
                ? 'Nothing is assigned to you right now.'
                : `Nothing open is assigned to ${person.name} in projects you share.`
            }
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border/60 rounded-lg border">
            {assigned.map((issue) => (
              <li key={issue.id}>
                <Link
                  href={issuePath(issue.projectId, issue.key)}
                  className="flex min-h-10 items-center gap-2.5 px-3 py-2 outline-none hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <PriorityIcon priority={issue.priority} size={14} />
                  <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
                    {issue.key}
                  </span>
                  <StateIcon state={issue.state} size={14} />
                  <span className="min-w-0 flex-1 truncate text-sm">{issue.title}</span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                    {projectNames.get(issue.projectId)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="person-activity">
        <h2 id="person-activity" className="mb-3 text-base font-medium">
          Recent activity
        </h2>
        {recent.length === 0 ? (
          <EmptyState
            className="rounded-lg border py-8"
            icon={<Activity />}
            title="No recent activity"
            description="Changes they make in projects you share show up here."
          />
        ) : (
          <ol className="flex flex-col gap-2.5">
            {recent.map((item) => {
              const data = item.data ?? {};
              const key =
                item.number !== null
                  ? `${item.ticketKey}-${item.number}`
                  : typeof data.key === 'string'
                    ? data.key
                    : null;
              const title = item.title ?? (typeof data.title === 'string' ? data.title : null);
              const linkable = item.ticketId !== null && item.number !== null && !item.deletedAt;
              return (
                <li key={item.id} className="flex items-baseline gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-muted-foreground">{activitySummary(item.type, data)}</span>
                    {key && (
                      <>
                        {' '}
                        {linkable ? (
                          <Link
                            href={issuePath(item.projectId, key)}
                            className="font-medium hover:underline"
                          >
                            {key}
                            {title && <span className="font-normal"> {title}</span>}
                          </Link>
                        ) : (
                          <span className="font-medium">
                            {key}
                            {title && <span className="font-normal"> {title}</span>}
                          </span>
                        )}
                      </>
                    )}
                    {!key && (
                      <span className="text-muted-foreground">
                        {' '}
                        in {projectNames.get(item.projectId) ?? item.projectName}
                      </span>
                    )}
                  </span>
                  <time
                    dateTime={item.createdAt.toISOString()}
                    className="shrink-0 text-xs text-muted-foreground"
                  >
                    {ago(item.createdAt)}
                  </time>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
