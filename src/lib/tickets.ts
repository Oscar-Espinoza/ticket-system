// Issue read DAL. queryIssues is the one way to load IssueRows: rows + labels in
// a single neon-http batch. It does NOT authorize — pass a `where` that does
// (memberOfIssueProject) or check membership first. getProjectIssues authorizes
// itself; getTicketById / getIssueByKey trust projectId (callers check first).

import { cache } from '@/lib/kit/request';
import { and, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db';
import {
  issueLabels,
  labels,
  projects,
  ticketKeyAliases,
  tickets,
  users,
  workflowStates,
} from '@/db/schema';
import type { IssueLabel, IssueRow } from '@/lib/issue-model';
import { projectMemberOf } from '@/lib/project-access';

/**
 * Full-text document of an issue. Must match the index expression in
 * 0003_seed_workflow_states.sql exactly, or Postgres can't use the GIN index.
 */
export const issueDocument = sql`to_tsvector('english', coalesce(${tickets.title}, '') || ' ' || coalesce(${tickets.description}, ''))`;

/** Join aliases, exported so callers can filter/sort on them in `where`/`orderBy`. */
export const assigneeUsers = alias(users, 'assignee');
export const creatorUsers = alias(users, 'creator');

const issueColumns = {
  id: tickets.id,
  projectId: tickets.projectId,
  ticketKey: projects.ticketKey,
  number: tickets.ticketNumber,
  title: tickets.title,
  description: tickets.description,
  stateId: tickets.stateId,
  stateName: workflowStates.name,
  stateType: workflowStates.type,
  stateColor: workflowStates.color,
  statePosition: workflowStates.position,
  stateDescription: workflowStates.description,
  priority: tickets.priority,
  estimate: tickets.estimate,
  startDate: tickets.startDate,
  dueDate: tickets.dueDate,
  slaDueAt: tickets.slaDueAt,
  slaBreachedAt: tickets.slaBreachedAt,
  stateChangedAt: tickets.stateChangedAt,
  parentId: tickets.parentId,
  sortOrder: tickets.sortOrder,
  cycleId: tickets.cycleId,
  epicId: tickets.epicId,
  milestoneId: tickets.milestoneId,
  githubBranch: tickets.githubBranch,
  startedAt: tickets.startedAt,
  completedAt: tickets.completedAt,
  canceledAt: tickets.canceledAt,
  archivedAt: tickets.archivedAt,
  deletedAt: tickets.deletedAt,
  createdAt: tickets.createdAt,
  updatedAt: tickets.updatedAt,
  assigneeId: assigneeUsers.id,
  assigneeName: assigneeUsers.name,
  assigneeImage: assigneeUsers.image,
  creatorId: creatorUsers.id,
  creatorName: creatorUsers.name,
  creatorImage: creatorUsers.image,
};

export type IssueSelectRow = Awaited<ReturnType<typeof selectIssueRows>>[number];

export interface QueryIssuesOptions {
  /** Default: newest first (createdAt desc, then number desc). */
  orderBy?: (SQL | AnyPgColumn)[];
  limit?: number;
  offset?: number;
}

// Both queries share this join chain, so any `where` over tickets, projects,
// workflowStates, assigneeUsers or creatorUsers is valid in either.
function selectIssueRows(where: SQL | undefined, opts: QueryIssuesOptions = {}) {
  let query = db
    .select(issueColumns)
    .from(tickets)
    .innerJoin(projects, eq(tickets.projectId, projects.id))
    .innerJoin(workflowStates, eq(tickets.stateId, workflowStates.id))
    .leftJoin(assigneeUsers, eq(tickets.assigneeId, assigneeUsers.id))
    .leftJoin(creatorUsers, eq(tickets.creatorId, creatorUsers.id))
    .where(where)
    .orderBy(...(opts.orderBy ?? [desc(tickets.createdAt), desc(tickets.ticketNumber)]))
    .$dynamic();
  if (opts.limit !== undefined) query = query.limit(opts.limit);
  if (opts.offset !== undefined) query = query.offset(opts.offset);
  return query;
}

function selectIssueIds(where: SQL | undefined, opts: QueryIssuesOptions) {
  let query = db
    .select({ id: tickets.id })
    .from(tickets)
    .innerJoin(projects, eq(tickets.projectId, projects.id))
    .innerJoin(workflowStates, eq(tickets.stateId, workflowStates.id))
    .leftJoin(assigneeUsers, eq(tickets.assigneeId, assigneeUsers.id))
    .leftJoin(creatorUsers, eq(tickets.creatorId, creatorUsers.id))
    .where(where)
    .orderBy(...(opts.orderBy ?? [desc(tickets.createdAt), desc(tickets.ticketNumber)]))
    .$dynamic();
  if (opts.limit !== undefined) query = query.limit(opts.limit);
  if (opts.offset !== undefined) query = query.offset(opts.offset);
  return query;
}

export function toIssueRow(row: IssueSelectRow, issueLabelsList: IssueLabel[] = []): IssueRow {
  return {
    id: row.id,
    projectId: row.projectId,
    key: `${row.ticketKey}-${row.number}`,
    number: row.number,
    title: row.title,
    description: row.description,
    stateId: row.stateId,
    state: {
      id: row.stateId,
      name: row.stateName,
      type: row.stateType,
      color: row.stateColor,
      position: row.statePosition,
      description: row.stateDescription,
    },
    priority: row.priority,
    estimate: row.estimate,
    startDate: row.startDate,
    dueDate: row.dueDate,
    slaDueAt: row.slaDueAt,
    slaBreachedAt: row.slaBreachedAt,
    stateChangedAt: row.stateChangedAt,
    assignee: row.assigneeId
      ? { id: row.assigneeId, name: row.assigneeName ?? '', image: row.assigneeImage }
      : null,
    creator: row.creatorId
      ? { id: row.creatorId, name: row.creatorName ?? '', image: row.creatorImage }
      : null,
    labels: issueLabelsList,
    parentId: row.parentId,
    sortOrder: row.sortOrder,
    cycleId: row.cycleId,
    epicId: row.epicId,
    milestoneId: row.milestoneId,
    githubBranch: row.githubBranch,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    canceledAt: row.canceledAt,
    archivedAt: row.archivedAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * The two queries behind queryIssues, for callers that want to fold an issue
 * read into their own db.batch. Merge the results with mergeIssueRows.
 */
export function issueQueries(where: SQL | undefined, opts: QueryIssuesOptions = {}) {
  return [
    selectIssueRows(where, opts),
    db
      .select({
        ticketId: issueLabels.ticketId,
        id: labels.id,
        name: labels.name,
        color: labels.color,
      })
      .from(issueLabels)
      .innerJoin(labels, eq(issueLabels.labelId, labels.id))
      .where(inArray(issueLabels.ticketId, selectIssueIds(where, opts)))
      .orderBy(labels.name),
  ] as const;
}

export function mergeIssueRows(
  rows: IssueSelectRow[],
  labelRows: (IssueLabel & { ticketId: string })[],
): IssueRow[] {
  const byTicket = new Map<string, IssueLabel[]>();
  for (const { ticketId, ...label } of labelRows) {
    const list = byTicket.get(ticketId);
    if (list) list.push(label);
    else byTicket.set(ticketId, [label]);
  }
  return rows.map((row) => toIssueRow(row, byTicket.get(row.id)));
}

/**
 * Load IssueRows matching `where` (rows + their labels, ONE round trip).
 * Does not authorize and does not exclude archived/deleted issues — say so in
 * `where` (e.g. activeIssue(), memberOfIssueProject(userId)).
 */
export async function queryIssues(
  where: SQL | undefined,
  opts: QueryIssuesOptions = {},
): Promise<IssueRow[]> {
  const [rows, labelRows] = await db.batch(issueQueries(where, opts));
  return mergeIssueRows(rows, labelRows);
}

/**
 * `userId` is a member of the issue's project. Use it in a queryIssues `where`
 * to authorize cross-project reads (My Issues, search).
 */
export function memberOfIssueProject(userId: string): SQL {
  return projectMemberOf(tickets.projectId, userId);
}

/** Active (not archived, not deleted) issues — the default list scope. */
export function activeIssue(): SQL {
  return and(isNull(tickets.archivedAt), isNull(tickets.deletedAt))!;
}

/**
 * The project's active issues (sub-issues included), membership-gated in SQL:
 * a non-member gets []. Memoized per request.
 */
export const getProjectIssues = cache(
  async (projectId: string, userId: string): Promise<IssueRow[]> => {
    if (!projectId || !userId) return [];
    return queryIssues(
      and(eq(tickets.projectId, projectId), activeIssue(), memberOfIssueProject(userId)),
    );
  },
);

/** Any issue of the project (archived / deleted included). Trusts projectId. */
export async function getTicketById(
  projectId: string,
  ticketId: string,
): Promise<IssueRow | null> {
  if (!projectId || !ticketId) return null;
  const [issue] = await queryIssues(
    and(eq(tickets.projectId, projectId), eq(tickets.id, ticketId)),
    { limit: 1 },
  );
  return issue ?? null;
}

/**
 * By per-project number ("ENG-12" → 12); archived / deleted included. Trusts
 * projectId. With `viewerId`, a number that no longer exists here falls back to
 * `ticket_key_alias` (issues moved to another project keep their old key) and
 * returns the issue only if `viewerId` is a member of the project it lives in
 * now — callers compare `issue.projectId` with `projectId` and redirect.
 */
export async function getIssueByKey(
  projectId: string,
  number: number,
  viewerId?: string,
): Promise<IssueRow | null> {
  if (!projectId || !Number.isInteger(number)) return null;
  const [issue] = await queryIssues(
    and(eq(tickets.projectId, projectId), eq(tickets.ticketNumber, number)),
    { limit: 1 },
  );
  if (issue || !viewerId) return issue ?? null;

  const [moved] = await db
    .select({ ticketId: ticketKeyAliases.ticketId })
    .from(ticketKeyAliases)
    .innerJoin(projects, sql`${ticketKeyAliases.key} = ${projects.ticketKey} || '-' || ${String(number)}`)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!moved) return null;
  const [found] = await queryIssues(
    and(eq(tickets.id, moved.ticketId), memberOfIssueProject(viewerId)),
    { limit: 1 },
  );
  return found ?? null;
}

/** "app-12" → { prefix: 'APP', number: 12 }; null when it isn't an issue key. */
export function parseIssueKey(raw: string): { prefix: string; number: number } | null {
  const match = /^([A-Za-z0-9]+)-(\d{1,9})$/.exec(raw.trim());
  return match ? { prefix: match[1].toUpperCase(), number: Number(match[2]) } : null;
}

/**
 * "APP-12" → the issue's id + project id, following ticket_key_alias for issues
 * that moved to another project. No authorization: callers check the viewer's
 * role in the returned project (REST v1 and GraphQL both do).
 */
export async function resolveIssueKey(
  key: string,
): Promise<{ id: string; projectId: string } | null> {
  const parsed = parseIssueKey(key);
  if (!parsed) return null;

  const [current, alias] = await db.batch([
    db
      .select({ id: tickets.id, projectId: tickets.projectId })
      .from(tickets)
      .innerJoin(projects, eq(projects.id, tickets.projectId))
      .where(and(eq(projects.ticketKey, parsed.prefix), eq(tickets.ticketNumber, parsed.number)))
      .limit(1),
    db
      .select({ id: tickets.id, projectId: tickets.projectId })
      .from(ticketKeyAliases)
      .innerJoin(tickets, eq(tickets.id, ticketKeyAliases.ticketId))
      .where(eq(ticketKeyAliases.key, `${parsed.prefix}-${parsed.number}`))
      .limit(1),
  ]);
  return current[0] ?? alias[0] ?? null;
}
