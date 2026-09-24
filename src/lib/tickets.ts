// Ticket read DAL (GSD Phase 5). getProjectView authorizes itself; getTicketById
// trusts projectId, so callers must check membership first.

import { cache } from 'react';
import { and, desc, eq, exists, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db';
import { projectMembers, projects, tickets, users } from '@/db/schema';
import type { IssueRow } from '@/lib/issue-model';

const issueColumns = {
  id: tickets.id,
  ticketKey: projects.ticketKey,
  number: tickets.ticketNumber,
  title: tickets.title,
  description: tickets.description,
  status: tickets.status,
  githubBranch: tickets.githubBranch,
  createdAt: tickets.createdAt,
  updatedAt: tickets.updatedAt,
  assigneeId: users.id,
  assigneeName: users.name,
  assigneeImage: users.image,
};

type IssueSelect = {
  id: string;
  ticketKey: string;
  number: number;
  title: string;
  description: string | null;
  status: IssueRow['status'];
  githubBranch: string | null;
  createdAt: Date;
  updatedAt: Date;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeImage: string | null;
};

function toIssueRow(row: IssueSelect): IssueRow {
  return {
    id: row.id,
    key: `${row.ticketKey}-${row.number}`,
    number: row.number,
    title: row.title,
    description: row.description,
    status: row.status,
    githubBranch: row.githubBranch,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    assignee: row.assigneeId
      ? {
          id: row.assigneeId,
          name: row.assigneeName ?? '',
          image: row.assigneeImage,
        }
      : null,
  };
}

function selectIssues(where: SQL | undefined) {
  return db
    .select(issueColumns)
    .from(tickets)
    .innerJoin(projects, eq(tickets.projectId, projects.id))
    .leftJoin(users, eq(tickets.assigneeId, users.id))
    .where(where);
}

export async function getTicketById(
  projectId: string,
  ticketId: string,
): Promise<IssueRow | null> {
  const [row] = await selectIssues(
    and(eq(tickets.projectId, projectId), eq(tickets.id, ticketId)),
  ).limit(1);
  return row ? toIssueRow(row) : null;
}

/**
 * Everything the project page needs, in ONE round trip (neon-http batch).
 *
 * Each query authorizes itself: the project row is inner-joined on the
 * viewer's membership, and tickets/members are gated by an EXISTS on it — so a
 * non-member reads nothing (the getProjectsForUser pattern, T-02-07). Returns
 * null for non-members. Memoized per request for the page + generateMetadata.
 */
export const getProjectView = cache(async (projectId: string, userId: string) => {
  if (!projectId || !userId) return null;
  const viewer = alias(projectMembers, 'viewer');
  const isMember = exists(
    db
      .select({ one: sql`1` })
      .from(viewer)
      .where(and(eq(viewer.projectId, projectId), eq(viewer.userId, userId))),
  );

  const [projectRows, ticketRows, members] = await db.batch([
    db
      .select({
        id: projects.id,
        name: projects.name,
        ticketKey: projects.ticketKey,
        role: projectMembers.role,
      })
      .from(projectMembers)
      .innerJoin(projects, eq(projectMembers.projectId, projects.id))
      .where(
        and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
      )
      .limit(1),
    selectIssues(and(eq(tickets.projectId, projectId), isMember)).orderBy(
      desc(tickets.ticketNumber),
    ),
    db
      .select({ id: users.id, name: users.name, image: users.image })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(and(eq(projectMembers.projectId, projectId), isMember))
      .orderBy(users.name),
  ]);

  const [project] = projectRows;
  if (!project) return null;
  return { project, issues: ticketRows.map(toIssueRow), members };
});
