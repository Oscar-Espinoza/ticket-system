// Server Component: project list for the authenticated user.
//
// Renders inside the dashboard `{children}` seam (no full-page wrapper).
// Shows: section header + "New project" CTA, then dense project rows or an
// EmptyState with a CTA.
//
// Authorization: The INNER JOIN on project_member restricts rows to projects
// where the viewer has a membership row (owner OR member). No cross-tenant
// project can appear (T-02-07).
//
// T-02-08: userId always comes from auth.api.getSession({ headers }) server-side.
// T-02-09: cast(count(...) as int) ensures numeric openCount/resolvedCount.

import { cache } from 'react';
import Link from 'next/link';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { ChevronRight, FolderPlus } from 'lucide-react';

import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { projects, projectMembers, tickets, workflowStates } from '@/db/schema';
import { CreateProjectDialog } from '@/components/create-project-dialog';
import { EmptyState, LabelChip } from '@/components/ui-icons';

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Returns every project the user owns or is a member of, with numeric open and
 * resolved ticket counts and ordered newest-first. "Resolved" means the
 * ticket's workflow state is completed or canceled; archived and trashed
 * tickets are excluded in the join so they count as neither.
 *
 * The INNER JOIN on project_member is the authorization filter — no project
 * without a membership row for this userId can appear in the result set.
 */
export const getProjectsForUser = cache(async (userId: string) =>
  db
    .select({
      id: projects.id,
      name: projects.name,
      ticketKey: projects.ticketKey,
      createdAt: projects.createdAt,
      role: projectMembers.role,
      // T-02-09: cast to int — PostgreSQL count() returns bigint, which Drizzle
      // types as string without the explicit cast.
      openCount: sql<number>`cast(count(case when ${workflowStates.type} not in ('completed', 'canceled') then 1 end) as int)`,
      resolvedCount: sql<number>`cast(count(case when ${workflowStates.type} in ('completed', 'canceled') then 1 end) as int)`,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .leftJoin(
      tickets,
      and(
        eq(tickets.projectId, projects.id),
        isNull(tickets.archivedAt),
        isNull(tickets.deletedAt),
      ),
    )
    .leftJoin(workflowStates, eq(workflowStates.id, tickets.stateId))
    .where(eq(projectMembers.userId, userId))
    .groupBy(
      projects.id,
      projects.name,
      projects.ticketKey,
      projects.createdAt,
      projectMembers.role,
    )
    .orderBy(sql`${projects.createdAt} desc`),
);

// ---------------------------------------------------------------------------
// Server Component
// ---------------------------------------------------------------------------

const ROLE_LABEL = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  guest: 'Guest',
} as const;

export async function ProjectList({ userId }: { userId?: string } = {}) {
  // IN-01: prefer a userId passed by the parent (which already resolved the
  // session) to avoid a second getSession() per dashboard request. Falls back
  // to resolving the session itself so the component stays self-contained.
  // T-02-08: userId always originates from auth.api.getSession server-side.
  let resolvedUserId = userId;
  if (!resolvedUserId) {
    const session = await getSession();
    resolvedUserId = session?.user?.id;
  }

  const userProjects = resolvedUserId
    ? await getProjectsForUser(resolvedUserId)
    : [];

  return (
    <div className="mt-8">
      {/* Section header — always visible regardless of empty state */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-medium">Projects</h3>
        <CreateProjectDialog />
      </div>

      {userProjects.length === 0 ? (
        <EmptyState
          icon={<FolderPlus />}
          title="No projects yet"
          description="Create your first project to get started."
          action={<CreateProjectDialog />}
        />
      ) : (
        <ul className="flex flex-col">
          {userProjects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/dashboard/projects/${p.id}`}
                className="group flex h-9 items-center gap-3 rounded-md px-2 transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none"
              >
                {/* Left: name + mono key chip + role chip */}
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">{p.name}</span>
                  <LabelChip dot={false} className="shrink-0 font-mono">
                    {p.ticketKey}
                  </LabelChip>
                  <LabelChip
                    color={p.role === 'owner' ? 'primary' : 'default'}
                    className="shrink-0"
                  >
                    {ROLE_LABEL[p.role]}
                  </LabelChip>
                </div>

                {/* Right: tabular ticket counts + hover chevron */}
                <span className="ml-auto shrink-0 text-xs tabular-nums whitespace-nowrap text-muted-foreground">
                  {p.openCount} open · {p.resolvedCount} resolved
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
