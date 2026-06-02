// Server Component: project list for the authenticated user.
//
// Renders inside the dashboard `{children}` seam (no full-page wrapper).
// Shows: section header + "New project" CTA, then either a card-per-project or
// the "No projects yet" empty state with a second CTA.
//
// Authorization: The INNER JOIN on project_member restricts rows to projects
// where the viewer has a membership row (owner OR member). No cross-tenant
// project can appear (T-02-07).
//
// T-02-08: userId always comes from auth.api.getSession({ headers }) server-side.
// T-02-09: cast(count(...) as int) ensures numeric openCount/resolvedCount.

import Link from 'next/link';
import { headers } from 'next/headers';
import { sql, eq } from 'drizzle-orm';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projects, projectMembers, tickets } from '@/db/schema';
import { CreateProjectDialog } from '@/components/create-project-dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Returns every project the user owns or is a member of, with numeric open and
 * resolved ticket counts and ordered newest-first.
 *
 * The INNER JOIN on project_member is the authorization filter — no project
 * without a membership row for this userId can appear in the result set.
 */
export async function getProjectsForUser(userId: string) {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      ticketKey: projects.ticketKey,
      createdAt: projects.createdAt,
      role: projectMembers.role,
      // T-02-09: cast to int — PostgreSQL count() returns bigint, which Drizzle
      // types as string without the explicit cast.
      openCount: sql<number>`cast(count(case when ${tickets.status} != 'done' and ${tickets.id} is not null then 1 end) as int)`,
      resolvedCount: sql<number>`cast(count(case when ${tickets.status} = 'done' then 1 end) as int)`,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .leftJoin(tickets, eq(tickets.projectId, projects.id))
    .where(eq(projectMembers.userId, userId))
    .groupBy(
      projects.id,
      projects.name,
      projects.ticketKey,
      projects.createdAt,
      projectMembers.role,
    )
    .orderBy(sql`${projects.createdAt} desc`);
}

// ---------------------------------------------------------------------------
// Server Component
// ---------------------------------------------------------------------------

export async function ProjectList() {
  // T-02-08: session is resolved server-side from the request headers.
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;

  const userProjects = user ? await getProjectsForUser(user.id) : [];

  return (
    <div className="mt-8">
      {/* Section header — always visible regardless of empty state */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold">Projects</h3>
        <CreateProjectDialog />
      </div>

      {userProjects.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <p className="text-base font-semibold text-foreground">No projects yet</p>
          <p className="text-sm text-muted-foreground">
            Create your first project to get started.
          </p>
          <CreateProjectDialog />
        </div>
      ) : (
        /* Project card list — newest first */
        <div className="flex flex-col gap-3">
          {userProjects.map((p) => (
            <Link key={p.id} href={`/dashboard/projects/${p.id}`}>
              <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    {/* Left: name + key badge + role badge */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{p.name}</span>
                      <Badge variant="secondary" className="font-mono">
                        {p.ticketKey}
                      </Badge>
                      {p.role === 'owner' ? (
                        <Badge variant="secondary">Owner</Badge>
                      ) : (
                        <Badge variant="outline">Member</Badge>
                      )}
                    </div>

                    {/* Right: ticket counts */}
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {p.openCount} open · {p.resolvedCount} resolved
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
