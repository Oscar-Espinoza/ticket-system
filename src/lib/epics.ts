// Epic reads (server-only). Authorization is in the SQL, like getProjectData:
// every query is gated by an EXISTS on the viewer's project membership, so a
// non-member reads nothing. Progress is aggregated in SQL, never by loading
// every issue.

import { cache } from 'react';
import { and, asc, desc, eq, exists, isNotNull, isNull, ne, sql, type SQL } from 'drizzle-orm';
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db';
import {
  epicUpdates,
  epics,
  milestones,
  projectMembers,
  tickets,
  users,
  workflowStates,
} from '@/db/schema';
import { activeIssue, issueQueries, memberOfIssueProject, mergeIssueRows } from '@/lib/tickets';
import type { IssueRow } from '@/lib/issue-model';
import {
  EMPTY_PROGRESS,
  type EpicRow,
  type EpicUpdateRow,
  type MilestoneRow,
  type Progress,
} from '@/components/epics/epic-model';

const leadUsers = alias(users, 'lead');
const authorUsers = alias(users, 'author');

/** EXISTS: `userId` is a member of the project in `projectColumn`. */
export function viewerIsMember(projectColumn: AnyPgColumn, userId: string): SQL {
  const viewer = alias(projectMembers, 'viewer');
  return exists(
    db
      .select({ one: sql`1` })
      .from(viewer)
      .where(and(eq(viewer.projectId, projectColumn), eq(viewer.userId, userId))),
  );
}

/** Aggregate columns for progress over tickets ⨝ workflow_state. */
export const progressColumns = {
  total: sql<number>`count(*)::int`,
  completed: sql<number>`(count(*) filter (where ${workflowStates.type} = 'completed'))::int`,
  started: sql<number>`(count(*) filter (where ${workflowStates.type} = 'started'))::int`,
  points: sql<number>`coalesce(sum(${tickets.estimate}), 0)::int`,
  completedPoints: sql<number>`coalesce(sum(${tickets.estimate}) filter (where ${workflowStates.type} = 'completed'), 0)::int`,
};

/** Issues that count toward progress: not trashed, not canceled (archived done work still counts). */
export const inProgressScope = () =>
  and(isNull(tickets.deletedAt), ne(workflowStates.type, 'canceled'))!;

export const epicColumns = {
  id: epics.id,
  projectId: epics.projectId,
  name: epics.name,
  description: epics.description,
  color: epics.color,
  status: epics.status,
  health: epics.health,
  startDate: epics.startDate,
  targetDate: epics.targetDate,
  initiativeId: epics.initiativeId,
  sortOrder: epics.sortOrder,
  archivedAt: epics.archivedAt,
  createdAt: epics.createdAt,
  updatedAt: epics.updatedAt,
  leadId: leadUsers.id,
  leadName: leadUsers.name,
  leadImage: leadUsers.image,
};

/** Epics joined with their lead; add your own `where`. */
export function selectEpics(where: SQL | undefined) {
  return db
    .select(epicColumns)
    .from(epics)
    .leftJoin(leadUsers, eq(epics.leadId, leadUsers.id))
    .where(where)
    .orderBy(asc(epics.sortOrder), asc(epics.createdAt));
}

type EpicSelectRow = Awaited<ReturnType<typeof selectEpics>>[number];

type ProgressRow = Progress & { key: string | null };

function progressMap(rows: ProgressRow[]) {
  return new Map(rows.map(({ key, ...progress }) => [key, progress]));
}

export function toEpicRow(row: EpicSelectRow, progress: Map<string | null, Progress>): EpicRow {
  const { leadId, leadName, leadImage, ...epic } = row;
  return {
    ...epic,
    lead: leadId ? { id: leadId, name: leadName ?? '', image: leadImage } : null,
    progress: progress.get(epic.id) ?? EMPTY_PROGRESS,
  };
}

/** Progress per epic for tickets matching `where`. */
export function epicProgressQuery(where: SQL | undefined) {
  return db
    .select({ key: tickets.epicId, ...progressColumns })
    .from(tickets)
    .innerJoin(workflowStates, eq(tickets.stateId, workflowStates.id))
    .where(and(isNotNull(tickets.epicId), inProgressScope(), where))
    .groupBy(tickets.epicId);
}

function selectMilestones(where: SQL | undefined) {
  return db
    .select({
      id: milestones.id,
      epicId: milestones.epicId,
      name: milestones.name,
      description: milestones.description,
      targetDate: milestones.targetDate,
      sortOrder: milestones.sortOrder,
    })
    .from(milestones)
    .innerJoin(epics, eq(milestones.epicId, epics.id))
    .where(where)
    .orderBy(asc(milestones.sortOrder), asc(milestones.createdAt));
}

function milestoneProgressQuery(where: SQL | undefined) {
  return db
    .select({ key: tickets.milestoneId, ...progressColumns })
    .from(tickets)
    .innerJoin(workflowStates, eq(tickets.stateId, workflowStates.id))
    .where(and(isNotNull(tickets.milestoneId), inProgressScope(), where))
    .groupBy(tickets.milestoneId);
}

export interface ProjectEpics {
  /** Archived included (callers filter), by sortOrder. */
  epics: EpicRow[];
  /** Milestones of those epics, by sortOrder. */
  milestones: MilestoneRow[];
}

/** Every epic of the project with progress and milestones; [] for non-members. */
export const getProjectEpics = cache(
  async (projectId: string, userId: string): Promise<ProjectEpics> => {
    if (!projectId || !userId) return { epics: [], milestones: [] };
    const isMember = viewerIsMember(epics.projectId, userId);
    const ticketMember = viewerIsMember(tickets.projectId, userId);

    const [epicRows, epicProgress, milestoneRows, milestoneProgress] = await db.batch([
      selectEpics(and(eq(epics.projectId, projectId), isMember)),
      epicProgressQuery(and(eq(tickets.projectId, projectId), ticketMember)),
      selectMilestones(and(eq(epics.projectId, projectId), isMember)),
      milestoneProgressQuery(and(eq(tickets.projectId, projectId), ticketMember)),
    ]);

    const progress = progressMap(epicProgress);
    const byMilestone = progressMap(milestoneProgress);
    return {
      epics: epicRows.map((row) => toEpicRow(row, progress)),
      milestones: milestoneRows.map((m) => ({
        ...m,
        progress: byMilestone.get(m.id) ?? EMPTY_PROGRESS,
      })),
    };
  },
);

export interface EpicDetail {
  epic: EpicRow;
  milestones: MilestoneRow[];
  /** Newest first, at most 50. */
  updates: EpicUpdateRow[];
  /** The epic's active issues. */
  issues: IssueRow[];
}

/** One epic of the project (archived included), or null for non-members / unknown ids. */
export const getEpicDetail = cache(
  async (projectId: string, epicId: string, userId: string): Promise<EpicDetail | null> => {
    if (!projectId || !epicId || !userId) return null;
    const isMember = viewerIsMember(epics.projectId, userId);
    const inEpic = and(eq(epics.id, epicId), eq(epics.projectId, projectId), isMember);
    const ticketWhere = and(
      eq(tickets.projectId, projectId),
      eq(tickets.epicId, epicId),
      memberOfIssueProject(userId),
    );

    const [epicRows, epicProgress, milestoneRows, milestoneProgress, updateRows, issueRows, labelRows] =
      await db.batch([
        selectEpics(inEpic),
        epicProgressQuery(ticketWhere),
        selectMilestones(inEpic),
        milestoneProgressQuery(ticketWhere),
        db
          .select({
            id: epicUpdates.id,
            epicId: epicUpdates.epicId,
            health: epicUpdates.health,
            body: epicUpdates.body,
            createdAt: epicUpdates.createdAt,
            authorId: authorUsers.id,
            authorName: authorUsers.name,
            authorImage: authorUsers.image,
          })
          .from(epicUpdates)
          .innerJoin(epics, eq(epicUpdates.epicId, epics.id))
          .leftJoin(authorUsers, eq(epicUpdates.authorId, authorUsers.id))
          .where(inEpic)
          .orderBy(desc(epicUpdates.createdAt))
          .limit(50),
        ...issueQueries(and(ticketWhere, activeIssue())),
      ]);

    const [row] = epicRows;
    if (!row) return null;
    const byMilestone = progressMap(milestoneProgress);
    return {
      epic: toEpicRow(row, progressMap(epicProgress)),
      milestones: milestoneRows.map((m) => ({
        ...m,
        progress: byMilestone.get(m.id) ?? EMPTY_PROGRESS,
      })),
      updates: updateRows.map(({ authorId, authorName, authorImage, ...update }) => ({
        ...update,
        author: authorId ? { id: authorId, name: authorName ?? '', image: authorImage } : null,
      })),
      issues: mergeIssueRows(issueRows, labelRows),
    };
  },
);
