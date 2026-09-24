// Ticket read DAL (GSD Phase 5). Callers must run requireProjectMember(projectId)
// first — these functions trust projectId.

import { and, desc, eq, inArray, isNull, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projectMembers, projects, tickets, users } from '@/db/schema';
import {
  UNASSIGNED,
  type IssueAssignee,
  type IssueFilters,
  type IssueRow,
} from '@/lib/issue-model';

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

export async function getProjectTickets(
  projectId: string,
  filters: IssueFilters = { statuses: [], assignee: null },
): Promise<IssueRow[]> {
  const conditions: SQL[] = [eq(tickets.projectId, projectId)];
  if (filters.statuses.length > 0) {
    conditions.push(inArray(tickets.status, filters.statuses));
  }
  if (filters.assignee === UNASSIGNED) {
    conditions.push(isNull(tickets.assigneeId));
  } else if (filters.assignee) {
    conditions.push(eq(tickets.assigneeId, filters.assignee));
  }

  const rows = await selectIssues(and(...conditions)).orderBy(
    desc(tickets.ticketNumber),
  );
  return rows.map(toIssueRow);
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

export async function getTicketByNumber(
  projectId: string,
  ticketNumber: number,
): Promise<IssueRow | null> {
  const [row] = await selectIssues(
    and(
      eq(tickets.projectId, projectId),
      eq(tickets.ticketNumber, ticketNumber),
    ),
  ).limit(1);
  return row ? toIssueRow(row) : null;
}

export async function getProjectMemberOptions(
  projectId: string,
): Promise<IssueAssignee[]> {
  return db
    .select({ id: users.id, name: users.name, image: users.image })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(users.name);
}
