// Workspace page: its projects ("teams") and members. Members only — anyone
// else gets notFound(), so slugs can't be probed. Project names and keys are
// visible to every workspace member; issue counts only for projects the
// viewer belongs to.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Building2, ScrollText, ShieldCheck, Target } from 'lucide-react';

import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import {
  projectMembers,
  projects,
  tickets,
  users,
  workflowStates,
  workspaceInvitations,
  workspaceMembers,
  workspaces,
} from '@/db/schema';
import { getWorkspaceMembership, workspaceInviteUrl } from '@/lib/workspace-access';
import { Button } from '@/components/ui/button';
import { LabelChip } from '@/components/ui-icons';
import { WorkspaceActions } from '@/components/workspaces/workspace-actions';
import { WorkspaceProjects } from '@/components/workspaces/workspace-projects';
import { WorkspaceMembers } from '@/components/workspaces/workspace-members';
import { WORKSPACE_ROLE_LABEL } from '@/components/workspaces/workspace-types';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const [{ slug }, session] = await Promise.all([params, getSession()]);
  const membership = session?.user ? await getWorkspaceMembership(slug, session.user.id) : null;
  return { title: membership ? membership.name : 'Workspace not found' };
}

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [{ slug }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');
  const userId = session.user.id;

  const membership = await getWorkspaceMembership(slug, userId);
  if (!membership) notFound();
  const workspaceId = membership.workspaceId;

  const viewer = alias(projectMembers, 'viewer_member');
  const otherWorkspace = alias(workspaces, 'other_workspace');
  const isAdmin = membership.role !== 'member';

  const [projectRows, openRows, memberRows, eligibleRows, invitationRows] = await db.batch([
    db
      .select({
        id: projects.id,
        name: projects.name,
        ticketKey: projects.ticketKey,
        viewerRole: viewer.role,
        memberCount: sql<number>`(select cast(count(*) as int) from ${projectMembers} where ${projectMembers.projectId} = ${projects.id})`,
        parentId: projects.parentId,
        visibility: projects.visibility,
      })
      .from(projects)
      .leftJoin(viewer, and(eq(viewer.projectId, projects.id), eq(viewer.userId, userId)))
      // Private teams the viewer isn't in never reach the browser.
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          or(isNotNull(viewer.id), eq(projects.visibility, 'workspace')),
        ),
      )
      .orderBy(asc(projects.name)),
    // Open issues, only in projects the viewer is a member of (the join gates it).
    db
      .select({
        projectId: tickets.projectId,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(tickets)
      .innerJoin(projects, eq(tickets.projectId, projects.id))
      .innerJoin(viewer, and(eq(viewer.projectId, projects.id), eq(viewer.userId, userId)))
      .innerJoin(workflowStates, eq(tickets.stateId, workflowStates.id))
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          isNull(tickets.archivedAt),
          isNull(tickets.deletedAt),
          sql`${workflowStates.type} not in ('completed', 'canceled')`,
        ),
      )
      .groupBy(tickets.projectId),
    db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, workspaceId)),
    // Projects the viewer administers that aren't here yet.
    db
      .select({
        id: projects.id,
        name: projects.name,
        ticketKey: projects.ticketKey,
        currentWorkspace: otherWorkspace.name,
      })
      .from(viewer)
      .innerJoin(projects, eq(viewer.projectId, projects.id))
      .leftJoin(otherWorkspace, eq(projects.workspaceId, otherWorkspace.id))
      .where(
        and(
          eq(viewer.userId, userId),
          inArray(viewer.role, ['owner', 'admin']),
          or(isNull(projects.workspaceId), ne(projects.workspaceId, workspaceId)),
        ),
      )
      .orderBy(asc(projects.name)),
    // Pending invitations (expired ones included, so they can be renewed) —
    // tokens are credentials, so only admins get rows back.
    db
      .select({
        id: workspaceInvitations.id,
        email: workspaceInvitations.email,
        role: workspaceInvitations.role,
        token: workspaceInvitations.token,
        expiresAt: workspaceInvitations.expiresAt,
        invitedByName: users.name,
      })
      .from(workspaceInvitations)
      .leftJoin(users, eq(workspaceInvitations.invitedById, users.id))
      .where(
        and(
          eq(workspaceInvitations.workspaceId, workspaceId),
          isNull(workspaceInvitations.acceptedAt),
          isAdmin ? undefined : sql`false`,
        ),
      )
      .orderBy(desc(workspaceInvitations.createdAt)),
  ]);

  const openByProject = new Map(openRows.map((row) => [row.projectId, row.count]));
  const projectList = projectRows.map((project) => ({
    ...project,
    openCount: project.viewerRole ? (openByProject.get(project.id) ?? 0) : null,
  }));
  const invitations = invitationRows.map(({ token, expiresAt, ...row }) => ({
    ...row,
    expiresAt: expiresAt.toISOString(),
    url: workspaceInviteUrl(token),
  }));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10">
      <header className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
        >
          <Building2 className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-medium">{membership.name}</h1>
          <p className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono text-xs">/{membership.slug}</span>
            <LabelChip color={membership.role === 'owner' ? 'primary' : 'default'}>
              {WORKSPACE_ROLE_LABEL[membership.role]}
            </LabelChip>
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/dashboard/workspaces/${membership.slug}/initiatives`}>
            <Target />
            Initiatives
          </Link>
        </Button>
        {isAdmin && (
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/workspaces/${membership.slug}/security`}>
                <ShieldCheck />
                Security
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/workspaces/${membership.slug}/audit`}>
                <ScrollText />
                Audit log
              </Link>
            </Button>
          </>
        )}
        <WorkspaceActions
          workspace={{ id: workspaceId, name: membership.name }}
          role={membership.role}
        />
      </header>

      <WorkspaceProjects
        workspaceId={workspaceId}
        projects={projectList}
        eligible={isAdmin ? eligibleRows : []}
        role={membership.role}
      />

      <WorkspaceMembers
        workspaceId={workspaceId}
        members={memberRows}
        invitations={invitations}
        viewerId={userId}
        role={membership.role}
      />
    </div>
  );
}
