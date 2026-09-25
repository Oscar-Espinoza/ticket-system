// Epic reads (server-only). Authorization is in the SQL, like getProjectData:
// every query is gated by an EXISTS on the viewer's project membership, so a
// non-member reads nothing. Progress is aggregated in SQL, never by loading
// every issue.
//
// Cross-project epics (D4b): issues of sibling projects in the workspace may
// join an epic, so issue reads and progress select by epic id — not by the
// epic's project — and filter each issue by the viewer's membership of *its*
// project. A viewer never sees (or counts) issues of projects they aren't in.

import { cache } from 'react';
import {
  and,
  asc,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db';
import {
  epicLabelLinks,
  epicLabels,
  epicRelations,
  epicUpdates,
  epics,
  milestones,
  projectMembers,
  projects,
  tickets,
  users,
  workflowStates,
} from '@/db/schema';
import { availableEpicsForProject } from '@/lib/issue-service';
import { activeIssue, issueQueries, memberOfIssueProject, mergeIssueRows } from '@/lib/tickets';
import type { IssueRow } from '@/lib/issue-model';
import {
  EMPTY_PROGRESS,
  type EpicDependency,
  type EpicLabelRow,
  type EpicRelationKind,
  type EpicRelationRow,
  type EpicRow,
  type EpicStatus,
  type EpicUpdateRow,
  type ForeignEpicOption,
  type MilestoneRow,
  type Progress,
  type ProjectRef,
} from '@/components/epics/epic-model';

const leadUsers = alias(users, 'lead');
const authorUsers = alias(users, 'author');
const otherEpics = alias(epics, 'other_epic');

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
  /** Archived included (callers filter), by sortOrder. Each carries `labelIds`. */
  epics: EpicRow[];
  /** Milestones of those epics, by sortOrder. */
  milestones: MilestoneRow[];
  /** The project's epic labels, by name. */
  labels: EpicLabelRow[];
  /** `blocks` edges between the project's epics. */
  dependencies: EpicDependency[];
}

/** Ids of the project's epics (subquery). */
const projectEpicIds = (projectId: string) =>
  db.select({ id: epics.id }).from(epics).where(eq(epics.projectId, projectId));

/** Ids of the project's epics' milestones (subquery). */
const projectMilestoneIds = (projectId: string) =>
  db
    .select({ id: milestones.id })
    .from(milestones)
    .innerJoin(epics, eq(milestones.epicId, epics.id))
    .where(eq(epics.projectId, projectId));

function selectEpicLabels(projectId: string, userId: string) {
  return db
    .select({ id: epicLabels.id, name: epicLabels.name, color: epicLabels.color })
    .from(epicLabels)
    .where(and(eq(epicLabels.projectId, projectId), viewerIsMember(epicLabels.projectId, userId)))
    .orderBy(asc(epicLabels.name));
}

function selectEpicLabelLinks(where: SQL | undefined) {
  return db
    .select({ epicId: epicLabelLinks.epicId, labelId: epicLabelLinks.labelId })
    .from(epicLabelLinks)
    .innerJoin(epics, eq(epicLabelLinks.epicId, epics.id))
    .where(where);
}

function labelIdsByEpic(rows: { epicId: string; labelId: string }[]) {
  const map = new Map<string, string[]>();
  for (const { epicId, labelId } of rows) {
    const list = map.get(epicId) ?? [];
    list.push(labelId);
    map.set(epicId, list);
  }
  return map;
}

/** Every epic of the project with progress and milestones; [] for non-members. */
export const getProjectEpics = cache(
  async (projectId: string, userId: string): Promise<ProjectEpics> => {
    const empty: ProjectEpics = { epics: [], milestones: [], labels: [], dependencies: [] };
    if (!projectId || !userId) return empty;
    const isMember = viewerIsMember(epics.projectId, userId);
    const ticketMember = viewerIsMember(tickets.projectId, userId);

    const [
      epicRows,
      epicProgress,
      milestoneRows,
      milestoneProgress,
      labelRows,
      linkRows,
      dependencyRows,
    ] = await db.batch([
      selectEpics(and(eq(epics.projectId, projectId), isMember)),
      epicProgressQuery(and(inArray(tickets.epicId, projectEpicIds(projectId)), ticketMember)),
      selectMilestones(and(eq(epics.projectId, projectId), isMember)),
      milestoneProgressQuery(
        and(inArray(tickets.milestoneId, projectMilestoneIds(projectId)), ticketMember),
      ),
      selectEpicLabels(projectId, userId),
      selectEpicLabelLinks(and(eq(epics.projectId, projectId), isMember)),
      db
        .select({
          id: epicRelations.id,
          blockerId: epicRelations.epicId,
          blockedId: epicRelations.relatedEpicId,
        })
        .from(epicRelations)
        .innerJoin(epics, eq(epicRelations.epicId, epics.id))
        .innerJoin(otherEpics, eq(epicRelations.relatedEpicId, otherEpics.id))
        .where(
          and(
            eq(epicRelations.type, 'blocks'),
            eq(epics.projectId, projectId),
            eq(otherEpics.projectId, projectId),
            isMember,
          ),
        ),
    ]);

    const progress = progressMap(epicProgress);
    const byMilestone = progressMap(milestoneProgress);
    const labelsOf = labelIdsByEpic(linkRows);
    return {
      epics: epicRows.map((row) => ({
        ...toEpicRow(row, progress),
        labelIds: labelsOf.get(row.id) ?? [],
      })),
      milestones: milestoneRows.map((m) => ({
        ...m,
        progress: byMilestone.get(m.id) ?? EMPTY_PROGRESS,
      })),
      labels: labelRows,
      dependencies: dependencyRows,
    };
  },
);

export interface EpicDetail {
  epic: EpicRow;
  milestones: MilestoneRow[];
  /** Newest first, at most 50. */
  updates: EpicUpdateRow[];
  /** The epic's active issues, from every project the viewer is a member of. */
  issues: IssueRow[];
  /** Projects of `issues` other than the epic's own, by name. */
  issueProjects: ProjectRef[];
  /** The project's epic labels (the epic's own are `epic.labelIds`). */
  labels: EpicLabelRow[];
  relations: EpicRelationRow[];
}

const relationEpicColumns = {
  id: otherEpics.id,
  projectId: otherEpics.projectId,
  name: otherEpics.name,
  color: otherEpics.color,
  status: otherEpics.status,
  startDate: otherEpics.startDate,
  targetDate: otherEpics.targetDate,
  archivedAt: otherEpics.archivedAt,
};

/**
 * Relations touching `epicId` whose other end is an epic of the same project
 * (relations are project-scoped; the membership EXISTS is defence in depth).
 */
function selectEpicRelations(projectId: string, epicId: string, userId: string) {
  const otherInProject = and(
    eq(otherEpics.projectId, projectId),
    viewerIsMember(otherEpics.projectId, userId),
  );
  return db
    .select({
      id: epicRelations.id,
      type: epicRelations.type,
      outgoing: sql<boolean>`${epicRelations.epicId} = ${epicId}`,
      epic: relationEpicColumns,
    })
    .from(epicRelations)
    .innerJoin(
      otherEpics,
      or(
        and(eq(epicRelations.epicId, epicId), eq(epicRelations.relatedEpicId, otherEpics.id)),
        and(eq(epicRelations.relatedEpicId, epicId), eq(epicRelations.epicId, otherEpics.id)),
      ),
    )
    .where(and(or(eq(epicRelations.epicId, epicId), eq(epicRelations.relatedEpicId, epicId)), otherInProject))
    .orderBy(asc(epicRelations.createdAt));
}

function relationKind(type: string, outgoing: boolean): EpicRelationKind {
  if (type !== 'blocks') return 'related';
  return outgoing ? 'blocks' : 'blocked_by';
}

/** One epic of the project (archived included), or null for non-members / unknown ids. */
export const getEpicDetail = cache(
  async (projectId: string, epicId: string, userId: string): Promise<EpicDetail | null> => {
    if (!projectId || !epicId || !userId) return null;
    const isMember = viewerIsMember(epics.projectId, userId);
    const inEpic = and(eq(epics.id, epicId), eq(epics.projectId, projectId), isMember);
    // Not scoped to the project: sibling projects' issues may join this epic.
    // The epic itself is checked (inEpic) — no row, no detail.
    const ticketWhere = and(eq(tickets.epicId, epicId), memberOfIssueProject(userId));

    const [
      epicRows,
      epicProgress,
      milestoneRows,
      milestoneProgress,
      updateRows,
      epicLabelRows,
      linkRows,
      relationRows,
      issueRows,
      labelRows,
    ] = await db.batch([
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
        selectEpicLabels(projectId, userId),
        selectEpicLabelLinks(inEpic),
        selectEpicRelations(projectId, epicId, userId),
        ...issueQueries(and(ticketWhere, activeIssue())),
      ]);

    const [row] = epicRows;
    if (!row) return null;
    const byMilestone = progressMap(milestoneProgress);
    const issues = mergeIssueRows(issueRows, labelRows);

    const foreignIds = [...new Set(issues.map((i) => i.projectId))].filter((id) => id !== projectId);
    // Membership already filtered the issues; the EXISTS keeps this read self-contained.
    const issueProjects: ProjectRef[] = foreignIds.length
      ? await db
          .select({ id: projects.id, name: projects.name, ticketKey: projects.ticketKey })
          .from(projects)
          .where(and(inArray(projects.id, foreignIds), viewerIsMember(projects.id, userId)))
          .orderBy(asc(projects.name))
      : [];

    return {
      epic: { ...toEpicRow(row, progressMap(epicProgress)), labelIds: linkRows.map((l) => l.labelId) },
      milestones: milestoneRows.map((m) => ({
        ...m,
        progress: byMilestone.get(m.id) ?? EMPTY_PROGRESS,
      })),
      updates: updateRows.map(({ authorId, authorName, authorImage, ...update }) => ({
        ...update,
        author: authorId ? { id: authorId, name: authorName ?? '', image: authorImage } : null,
      })),
      issues,
      issueProjects,
      labels: epicLabelRows,
      relations: relationRows.map(({ id, type, outgoing, epic }) => ({
        id,
        kind: relationKind(type, outgoing),
        epic: { ...epic, status: epic.status as EpicStatus },
      })),
    };
  },
);

/**
 * Non-archived epics of the *other* projects in this project's workspace that
 * its issues may join, as seen by `userId` — D4a's `availableEpicsForProject`
 * (the issue service's own rule, so the picker never offers what a write
 * would reject), minus the project's own epics (project data has those).
 */
export const getCrossProjectEpicOptions = cache(
  async (projectId: string, userId: string): Promise<ForeignEpicOption[]> => {
    const available = await availableEpicsForProject(projectId, userId);
    return available
      .filter((epic) => epic.external)
      .map((epic) => ({
        id: epic.id,
        name: epic.name,
        color: epic.color,
        status: epic.status,
        project: { id: epic.projectId, name: epic.projectName, ticketKey: epic.ticketKey },
        milestones: epic.milestones.map((m) => ({ id: m.id, name: m.name })),
      }));
  },
);
