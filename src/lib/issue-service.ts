// Issue write service — the ONE place issues are created, changed, archived,
// trashed, restored and purged. Server actions, the public API, the GitHub
// webhook, intake forms, imports and automations all call these.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ NO AUTHORIZATION HAPPENS HERE. Callers MUST authorize first:            │
// │   - server actions: authorizeProjectAction(projectId, level)            │
// │   - API routes: API key → user → membership + role                      │
// │   - webhooks / automations: verify the signature / own the project      │
// │ Every function then scopes writes by (issue id, project id) and checks  │
// │ that every referenced id (state, label, assignee, parent, cycle, epic,  │
// │ milestone) belongs to `projectId`, so ids can't reach across projects.  │
// │ Nothing here calls revalidatePath — callers revalidate what they show.  │
// └─────────────────────────────────────────────────────────────────────────┘
//
// `actor.userId` null = system / integration: creatorId and activity actorId
// are stored as null. Every successful write emits activity + events
// (src/lib/events.ts), written in the same db.batch as the change.

import { and, asc, eq, exists, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { alias, type AnyPgColumn, type PgUpdateSetSource } from 'drizzle-orm/pg-core';
import type { BatchItem } from 'drizzle-orm/batch';

import { db } from '@/lib/db';
import {
  activities,
  cycles,
  epics,
  githubPullRequests,
  issueLabels,
  labels,
  milestones,
  notifications,
  projectMembers,
  projects,
  ticketKeyAliases,
  tickets,
  users,
  workflowStates,
} from '@/db/schema';
import {
  ISSUE_EVENT,
  emitIssueEvent,
  prepareIssueEvents,
  publishIssueEvents,
  type IssueChange,
  type IssueEventInput,
} from '@/lib/events';
import { isValidEstimate } from '@/lib/estimates';
import { isDateString } from '@/lib/dates';
import {
  isPriority,
  type CreateIssueInput,
  type IssueField,
  type IssueLabel,
  type IssuePatch,
  type IssueRow,
  type IssueUser,
  type WorkflowState,
} from '@/lib/issue-model';
import type { EpicSummary } from '@/lib/project-data-types';
import { issueQueries, mergeIssueRows, queryIssues } from '@/lib/tickets';
import {
  defaultNewIssueState,
  firstStateOfType,
  sortStates,
  stateTransitionTimestamps,
} from '@/lib/workflow';

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

export interface IssueActor {
  /** null = system / integration (no user). */
  userId: string | null;
}

export const SYSTEM_ACTOR: IssueActor = { userId: null };

export type IssueServiceError = { ok: false; error: string; field?: IssueField };
export type IssueResult = { ok: true; issue: IssueRow } | IssueServiceError;
export type IssuesResult = { ok: true; issues: IssueRow[] } | IssueServiceError;
export type PurgeResult = { ok: true } | IssueServiceError;

export type { CreateIssueInput };

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 10_000;
export const LABELS_MAX = 50;
export const BULK_MAX = 250;

const NOT_FOUND: IssueServiceError = { ok: false, error: 'Issue not found.' };

function fail(error: string, field?: IssueField): IssueServiceError {
  return field ? { ok: false, error, field } : { ok: false, error };
}

// ---------------------------------------------------------------------------
// Input shape (untrusted — may come straight from a client or an API body)
// ---------------------------------------------------------------------------

function optionalId(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.length > 0);
}

function normalizePatch(input: unknown): { ok: true; patch: IssuePatch } | IssueServiceError {
  if (!input || typeof input !== 'object') return fail('Invalid changes.');
  const raw = input as Record<string, unknown>;
  const patch: IssuePatch = {};

  if (raw.title !== undefined) {
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!title) return fail('Title is required.', 'title');
    if (title.length > TITLE_MAX) {
      return fail(`Title must be ${TITLE_MAX} characters or fewer.`, 'title');
    }
    patch.title = title;
  }
  if (raw.description !== undefined) {
    if (raw.description !== null && typeof raw.description !== 'string') {
      return fail('Invalid description.', 'description');
    }
    const description = raw.description?.trim() ?? '';
    if (description.length > DESCRIPTION_MAX) {
      return fail(`Description must be ${DESCRIPTION_MAX} characters or fewer.`, 'description');
    }
    patch.description = description || null;
  }
  if (raw.stateId !== undefined) {
    if (typeof raw.stateId !== 'string' || !raw.stateId) return fail('Invalid state.', 'stateId');
    patch.stateId = raw.stateId;
  }
  if (raw.priority !== undefined) {
    if (!isPriority(raw.priority)) return fail('Invalid priority.', 'priority');
    patch.priority = raw.priority;
  }
  if (raw.estimate !== undefined) {
    if (raw.estimate !== null && !Number.isInteger(raw.estimate)) {
      return fail('Invalid estimate.', 'estimate');
    }
    patch.estimate = raw.estimate as number | null;
  }
  if (raw.dueDate !== undefined) {
    if (raw.dueDate !== null && !isDateString(raw.dueDate)) {
      return fail('Invalid due date.', 'dueDate');
    }
    patch.dueDate = raw.dueDate;
  }
  if (raw.startDate !== undefined) {
    if (raw.startDate !== null && !isDateString(raw.startDate)) {
      return fail('Invalid start date.', 'startDate');
    }
    patch.startDate = raw.startDate;
  }
  for (const field of ['assigneeId', 'parentId', 'cycleId', 'epicId', 'milestoneId'] as const) {
    if (raw[field] === undefined) continue;
    if (!optionalId(raw[field])) return fail(`Invalid ${field.replace(/Id$/, '')}.`, field);
    patch[field] = raw[field];
  }
  if (raw.sortOrder !== undefined) {
    if (typeof raw.sortOrder !== 'number' || !Number.isFinite(raw.sortOrder)) {
      return fail('Invalid sort order.', 'sortOrder');
    }
    patch.sortOrder = raw.sortOrder;
  }
  for (const field of ['labelIds', 'addLabelIds', 'removeLabelIds'] as const) {
    const value = raw[field];
    if (value === undefined) continue;
    if (!Array.isArray(value) || !value.every((id) => typeof id === 'string' && id.length > 0)) {
      return fail('Invalid label.', field);
    }
    const ids = [...new Set(value as string[])];
    if (ids.length > LABELS_MAX) return fail(`At most ${LABELS_MAX} labels.`, field);
    patch[field] = ids;
  }
  if (patch.labelIds && (patch.addLabelIds || patch.removeLabelIds)) {
    return fail('Send either labelIds or addLabelIds / removeLabelIds, not both.', 'labelIds');
  }
  if (patch.addLabelIds?.some((id) => patch.removeLabelIds?.includes(id))) {
    return fail("A label can't be both added and removed.", 'addLabelIds');
  }
  return { ok: true, patch };
}

// ---------------------------------------------------------------------------
// Context: the issues being changed + every referenced row, ONE round trip
// ---------------------------------------------------------------------------

interface Named {
  id: string;
  name: string;
}

interface ParentRef {
  id: string;
  key: string;
  title: string;
  deleted: boolean;
}

interface Context {
  project: {
    id: string;
    ticketKey: string;
    estimateScale: string;
    slaPolicy: Record<string, number>;
  };
  states: WorkflowState[];
  issues: IssueRow[];
  labels: Map<string, IssueLabel>;
  assignee: IssueUser | null;
  parents: Map<string, ParentRef>;
  cycles: Map<string, Named>;
  epics: Map<string, Named & { available: boolean }>;
  milestones: Map<string, Named & { epicId: string; available: boolean }>;
  /** Issues (of `issueIds`) that are the new parent or one of its ancestors. */
  cyclic: Set<string>;
  actor: IssueUser | null;
}

const NOTHING = sql`false`;

/** Deadline from a project's SLA policy ({ priority: hours }); null when none applies. */
export function slaDeadline(
  policy: Record<string, number> | null | undefined,
  priority: string,
  from: Date,
): Date | null {
  const hours = policy?.[priority];
  return typeof hours === 'number' && hours > 0 ? new Date(from.getTime() + hours * 3_600_000) : null;
}

// ---------------------------------------------------------------------------
// Cross-project epics (.planning/features/D4a-cross-project-epics.md)
// ---------------------------------------------------------------------------

/**
 * SQL predicate over the `epic` table: an issue of `projectId` may point at
 * this epic, for `userId`. Own epics always; another project's epics when both
 * projects share a workspace and `userId` is a member of the epic's project.
 * System actors (null) only get the project's own epics.
 */
export function epicAvailableTo(projectId: string, userId: string | null): SQL {
  const own = eq(epics.projectId, projectId);
  if (!userId) return own;
  const epicProject = alias(projects, 'epic_project');
  const issueProject = alias(projects, 'issue_project');
  const epicMember = alias(projectMembers, 'epic_member');
  return or(
    own,
    and(
      exists(
        db
          .select({ one: sql`1` })
          .from(epicProject)
          .innerJoin(issueProject, eq(issueProject.workspaceId, epicProject.workspaceId))
          .where(and(eq(epicProject.id, epics.projectId), eq(issueProject.id, projectId))),
      ),
      exists(
        db
          .select({ one: sql`1` })
          .from(epicMember)
          .where(and(eq(epicMember.projectId, epics.projectId), eq(epicMember.userId, userId))),
      ),
    ),
  )!;
}

const epicAvailableSql = (projectId: string, userId: string | null) =>
  sql<boolean>`(${epicAvailableTo(projectId, userId)})`.mapWith(Boolean);

export interface AvailableEpic extends EpicSummary {
  projectId: string;
  projectName: string;
  ticketKey: string;
  /** Owned by another project than the one asked about. */
  external: boolean;
}

/**
 * Non-archived epics (+ milestones) that issues of `projectId` may use, as seen
 * by `userId`: the project's own first (sortOrder, name), then other workspace
 * projects' (project name, sortOrder). [] when `userId` isn't a member of
 * `projectId`. Server-only; wrap it in your own authorized server action.
 */
export async function availableEpicsForProject(
  projectId: string,
  userId: string,
): Promise<AvailableEpic[]> {
  if (!projectId || !userId) return [];
  const viewer = alias(projectMembers, 'viewer');
  const where = and(
    isNull(epics.archivedAt),
    epicAvailableTo(projectId, userId),
    exists(
      db
        .select({ one: sql`1` })
        .from(viewer)
        .where(and(eq(viewer.projectId, projectId), eq(viewer.userId, userId))),
    ),
  );
  const [epicRows, milestoneRows] = await db.batch([
    db
      .select({
        id: epics.id,
        name: epics.name,
        color: epics.color,
        status: epics.status,
        projectId: epics.projectId,
        projectName: projects.name,
        ticketKey: projects.ticketKey,
      })
      .from(epics)
      .innerJoin(projects, eq(epics.projectId, projects.id))
      .where(where)
      .orderBy(asc(projects.name), asc(epics.sortOrder), asc(epics.name)),
    db
      .select({ id: milestones.id, name: milestones.name, epicId: milestones.epicId })
      .from(milestones)
      .innerJoin(epics, eq(milestones.epicId, epics.id))
      .where(where)
      .orderBy(asc(milestones.sortOrder), asc(milestones.name)),
  ]);

  const byId = new Map<string, AvailableEpic>(
    epicRows.map((epic) => [
      epic.id,
      { ...epic, external: epic.projectId !== projectId, milestones: [] },
    ]),
  );
  for (const { epicId, ...milestone } of milestoneRows) byId.get(epicId)?.milestones.push(milestone);
  const list = [...byId.values()];
  // Stable sort: own epics first, the query's order otherwise.
  return list.sort((a, b) => Number(a.external) - Number(b.external));
}

async function loadContext(
  projectId: string,
  actorId: string | null,
  patch: IssuePatch,
  issueIds: string[],
): Promise<Context | null> {
  const src = alias(tickets, 'src');
  const labelIds = [
    ...(patch.labelIds ?? []),
    ...(patch.addLabelIds ?? []),
    ...(patch.removeLabelIds ?? []),
  ];
  // New target id OR the ids the issues currently point at (for "from" names).
  const refCond = (
    column: AnyPgColumn,
    next: string | null | undefined,
    current: AnyPgColumn,
  ): SQL => {
    const parts: SQL[] = [];
    if (next) parts.push(eq(column, next));
    if (issueIds.length) {
      parts.push(
        inArray(column, db.select({ id: current }).from(src).where(inArray(src.id, issueIds))),
      );
    }
    return parts.length ? or(...parts)! : NOTHING;
  };

  const [
    issueRows,
    issueLabelRows,
    projectRows,
    stateRows,
    labelRows,
    assigneeRows,
    parentRows,
    cycleRows,
    epicRows,
    milestoneRows,
    cyclicRows,
    actorRows,
  ] = await db.batch([
    ...issueQueries(
      issueIds.length
        ? and(eq(tickets.projectId, projectId), inArray(tickets.id, issueIds))
        : NOTHING,
    ),
    db
      .select({
        id: projects.id,
        ticketKey: projects.ticketKey,
        estimateScale: projects.estimateScale,
        slaPolicy: projects.slaPolicy,
      })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1),
    db
      .select({
        id: workflowStates.id,
        name: workflowStates.name,
        type: workflowStates.type,
        color: workflowStates.color,
        position: workflowStates.position,
        description: workflowStates.description,
      })
      .from(workflowStates)
      .where(eq(workflowStates.projectId, projectId)),
    db
      .select({ id: labels.id, name: labels.name, color: labels.color })
      .from(labels)
      .where(
        labelIds.length
          ? and(eq(labels.projectId, projectId), inArray(labels.id, labelIds))
          : NOTHING,
      ),
    db
      .select({ id: users.id, name: users.name, image: users.image })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.userId, users.id))
      .where(
        patch.assigneeId
          ? and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, patch.assigneeId))
          : NOTHING,
      )
      .limit(1),
    db
      .select({
        id: tickets.id,
        number: tickets.ticketNumber,
        title: tickets.title,
        deletedAt: tickets.deletedAt,
      })
      .from(tickets)
      .where(and(eq(tickets.projectId, projectId), refCond(tickets.id, patch.parentId, src.parentId))),
    db
      .select({ id: cycles.id, number: cycles.number, name: cycles.name })
      .from(cycles)
      .where(and(eq(cycles.projectId, projectId), refCond(cycles.id, patch.cycleId, src.cycleId))),
    // Epics / milestones aren't project-scoped here: the issues' current ones
    // are loaded for their names even when the actor can no longer see them;
    // `available` decides whether one may be newly assigned (cross-project epics).
    db
      .select({ id: epics.id, name: epics.name, available: epicAvailableSql(projectId, actorId) })
      .from(epics)
      .where(refCond(epics.id, patch.epicId, src.epicId)),
    db
      .select({
        id: milestones.id,
        name: milestones.name,
        epicId: milestones.epicId,
        available: epicAvailableSql(projectId, actorId),
      })
      .from(milestones)
      .innerJoin(epics, eq(milestones.epicId, epics.id))
      .where(refCond(milestones.id, patch.milestoneId, src.milestoneId)),
    // Walk up from the proposed parent; any of our issues on that path would
    // make a cycle (including parent = self). Depth-capped against bad data.
    db
      .select({ id: tickets.id })
      .from(tickets)
      .where(
        patch.parentId && issueIds.length
          ? and(
              inArray(tickets.id, issueIds),
              sql`${tickets.id} in (
                with recursive ancestors(id, parent_id, depth) as (
                  select a.id, a.parent_id, 0 from ${tickets} a where a.id = ${patch.parentId}
                  union all
                  select p.id, p.parent_id, ancestors.depth + 1
                  from ${tickets} p join ancestors on p.id = ancestors.parent_id
                  where ancestors.depth < 50
                )
                select id from ancestors
              )`,
            )
          : NOTHING,
      ),
    db
      .select({ id: users.id, name: users.name, image: users.image })
      .from(users)
      .where(actorId ? eq(users.id, actorId) : NOTHING)
      .limit(1),
  ]);

  const [project] = projectRows;
  if (!project) return null;
  const key = (number: number) => `${project.ticketKey}-${number}`;

  return {
    project,
    states: sortStates(stateRows),
    issues: mergeIssueRows(issueRows, issueLabelRows),
    labels: new Map(labelRows.map((label) => [label.id, label])),
    assignee: assigneeRows[0] ?? null,
    parents: new Map(
      parentRows.map((p) => [
        p.id,
        { id: p.id, key: key(p.number), title: p.title, deleted: p.deletedAt !== null },
      ]),
    ),
    cycles: new Map(cycleRows.map((c) => [c.id, { id: c.id, name: c.name ?? `Cycle ${c.number}` }])),
    epics: new Map(epicRows.map((e) => [e.id, e])),
    milestones: new Map(milestoneRows.map((m) => [m.id, m])),
    cyclic: new Set(cyclicRows.map((r) => r.id)),
    actor: actorRows[0] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Resolving a patch against the project
// ---------------------------------------------------------------------------

interface Resolved {
  state?: WorkflowState;
  labels?: IssueLabel[];
  /** addLabelIds / removeLabelIds, applied per issue. */
  labelDelta?: { add: IssueLabel[]; remove: Set<string> };
  assignee?: IssueUser | null;
  /** Epic implied by the milestone (a milestone always belongs to one epic). */
  milestoneEpicId?: string;
}

const byName = (a: IssueLabel, b: IssueLabel) => a.name.localeCompare(b.name);

function resolvePatch(ctx: Context, patch: IssuePatch): { ok: true; resolved: Resolved } | IssueServiceError {
  const resolved: Resolved = {};

  if (patch.stateId !== undefined) {
    const state = ctx.states.find((s) => s.id === patch.stateId);
    if (!state) return fail('Invalid state.', 'stateId');
    resolved.state = state;
  }
  if (patch.estimate !== undefined && patch.estimate !== null) {
    if (!isValidEstimate(ctx.project.estimateScale, patch.estimate)) {
      return fail(
        ctx.project.estimateScale === 'none'
          ? 'Estimates are turned off for this project.'
          : 'Invalid estimate.',
        'estimate',
      );
    }
  }
  if (patch.labelIds !== undefined) {
    const found = patch.labelIds.map((id) => ctx.labels.get(id));
    if (found.some((label) => !label)) return fail('Invalid label.', 'labelIds');
    resolved.labels = (found as IssueLabel[]).sort(byName);
  }
  if (patch.addLabelIds !== undefined || patch.removeLabelIds !== undefined) {
    const add = (patch.addLabelIds ?? []).map((id) => ctx.labels.get(id));
    if (add.some((label) => !label)) return fail('Invalid label.', 'addLabelIds');
    const remove = patch.removeLabelIds ?? [];
    if (remove.some((id) => !ctx.labels.has(id))) return fail('Invalid label.', 'removeLabelIds');
    resolved.labelDelta = { add: add as IssueLabel[], remove: new Set(remove) };
  }
  if (patch.assigneeId !== undefined) {
    if (patch.assigneeId !== null && !ctx.assignee) {
      return fail('Assignee must be a project member.', 'assigneeId');
    }
    resolved.assignee = patch.assigneeId === null ? null : ctx.assignee;
  }
  if (patch.parentId) {
    const parent = ctx.parents.get(patch.parentId);
    if (!parent || parent.deleted) return fail('Invalid parent issue.', 'parentId');
    if (ctx.cyclic.size > 0) {
      return fail("An issue can't be a sub-issue of itself or of its own sub-issues.", 'parentId');
    }
  }
  if (patch.cycleId && !ctx.cycles.has(patch.cycleId)) return fail('Invalid cycle.', 'cycleId');
  if (patch.epicId && !ctx.epics.get(patch.epicId)?.available) return fail('Invalid epic.', 'epicId');
  if (patch.milestoneId) {
    const milestone = ctx.milestones.get(patch.milestoneId);
    if (!milestone?.available) return fail('Invalid milestone.', 'milestoneId');
    if (patch.epicId !== undefined && patch.epicId !== milestone.epicId) {
      return fail('That milestone belongs to another epic.', 'milestoneId');
    }
    resolved.milestoneEpicId = milestone.epicId;
  }
  return { ok: true, resolved };
}

type TicketSet = Partial<typeof tickets.$inferInsert>;

const named = <T extends Named>(value: T | undefined) =>
  value ? { id: value.id, name: value.name } : null;

/** Apply a resolved patch to one issue: the DB `set`, the next row, the change log. */
function applyToIssue(
  ctx: Context,
  old: IssueRow,
  patch: IssuePatch,
  resolved: Resolved,
  now: Date,
): { set: TicketSet; next: IssueRow; changes: IssueChange[] } {
  const set: TicketSet = {};
  const next: IssueRow = { ...old };

  for (const field of ['title', 'description', 'priority', 'estimate', 'startDate', 'dueDate', 'parentId', 'cycleId', 'sortOrder'] as const) {
    if (patch[field] !== undefined) {
      (set as Record<string, unknown>)[field] = patch[field];
      (next as unknown as Record<string, unknown>)[field] = patch[field];
    }
  }
  if (resolved.state) {
    const timestamps = stateTransitionTimestamps(old.state.type, resolved.state.type, old, now);
    const moved = resolved.state.id !== old.stateId ? { stateChangedAt: now } : {};
    Object.assign(set, { stateId: resolved.state.id }, timestamps, moved);
    Object.assign(next, { stateId: resolved.state.id, state: resolved.state }, timestamps, moved);
  }
  // A priority change restarts the SLA clock (or clears it when the new
  // priority has no target); breaches are flagged by the daily SLA job.
  if (patch.priority !== undefined && patch.priority !== old.priority) {
    const slaDueAt = slaDeadline(ctx.project.slaPolicy, patch.priority, now);
    Object.assign(set, { slaDueAt, slaBreachedAt: null });
    Object.assign(next, { slaDueAt, slaBreachedAt: null });
  }
  if (resolved.assignee !== undefined) {
    set.assigneeId = resolved.assignee?.id ?? null;
    next.assignee = resolved.assignee;
  }
  if (resolved.labels) next.labels = resolved.labels;
  else if (resolved.labelDelta) {
    const { add, remove } = resolved.labelDelta;
    const kept = old.labels.filter((l) => !remove.has(l.id));
    const added = add.filter((l) => !kept.some((k) => k.id === l.id));
    // Unchanged issues keep their array: no change entry, no write.
    if (added.length || kept.length !== old.labels.length) {
      next.labels = [...kept, ...added].sort(byName);
    }
  }

  let epicId = patch.epicId;
  let milestoneId = patch.milestoneId;
  if (milestoneId) epicId = resolved.milestoneEpicId;
  if (epicId !== undefined) {
    set.epicId = next.epicId = epicId;
    // A milestone belongs to its epic: moving epics drops it.
    if (milestoneId === undefined && epicId !== old.epicId) milestoneId = null;
  }
  if (milestoneId !== undefined) set.milestoneId = next.milestoneId = milestoneId;

  const changes: IssueChange[] = [];
  const push = (field: IssueField, from: unknown, to: unknown) => changes.push({ field, from, to });

  if (next.title !== old.title) push('title', old.title, next.title);
  // Values omitted: descriptions can be large; readers look up the issue.
  if (next.description !== old.description) push('description', null, null);
  if (next.stateId !== old.stateId) {
    const describe = (s: WorkflowState) => ({ id: s.id, name: s.name, type: s.type });
    push('stateId', describe(old.state), describe(next.state));
  }
  if (next.priority !== old.priority) push('priority', old.priority, next.priority);
  if (next.estimate !== old.estimate) push('estimate', old.estimate, next.estimate);
  if (next.dueDate !== old.dueDate) push('dueDate', old.dueDate, next.dueDate);
  if (next.startDate !== old.startDate) push('startDate', old.startDate, next.startDate);
  if ((next.assignee?.id ?? null) !== (old.assignee?.id ?? null)) {
    const describe = (u: IssueUser | null) => (u ? { id: u.id, name: u.name } : null);
    push('assigneeId', describe(old.assignee), describe(next.assignee));
  }
  if (next.parentId !== old.parentId) {
    const describe = (id: string | null) => {
      const parent = id ? ctx.parents.get(id) : undefined;
      return parent ? { id: parent.id, key: parent.key, title: parent.title } : id && { id };
    };
    push('parentId', describe(old.parentId), describe(next.parentId));
  }
  if (next.cycleId !== old.cycleId) {
    push('cycleId', named(ctx.cycles.get(old.cycleId ?? '')), named(ctx.cycles.get(next.cycleId ?? '')));
  }
  if (next.epicId !== old.epicId) {
    push('epicId', named(ctx.epics.get(old.epicId ?? '')), named(ctx.epics.get(next.epicId ?? '')));
  }
  if (next.milestoneId !== old.milestoneId) {
    push(
      'milestoneId',
      named(ctx.milestones.get(old.milestoneId ?? '')),
      named(ctx.milestones.get(next.milestoneId ?? '')),
    );
  }
  if (next.labels !== old.labels) {
    const before = new Set(old.labels.map((l) => l.id));
    const after = new Set(next.labels.map((l) => l.id));
    const describe = (l: IssueLabel) => ({ id: l.id, name: l.name, color: l.color });
    const added = next.labels.filter((l) => !before.has(l.id)).map(describe);
    const removed = old.labels.filter((l) => !after.has(l.id)).map(describe);
    if (added.length || removed.length) {
      changes.push({
        field: 'labelIds',
        from: old.labels.map(describe),
        to: next.labels.map(describe),
        added,
        removed,
      });
    }
  }
  return { set, next, changes };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreateIssueOptions {
  /**
   * 'import' marks the `issue.created` event `data.bulk: true`: it is still
   * recorded in activity, but Slack, outgoing webhooks and notifications skip
   * it so a CSV import doesn't flood them.
   */
  source?: 'import';
}

export async function createIssue(
  actor: IssueActor,
  projectId: string,
  input: CreateIssueInput,
  opts?: CreateIssueOptions,
): Promise<IssueResult> {
  if (!projectId) return fail('Project not found.');
  const normalized = normalizePatch(input);
  if (!normalized.ok) return normalized;
  const patch = normalized.patch;
  if (patch.title === undefined) return fail('Title is required.', 'title');
  if (patch.addLabelIds || patch.removeLabelIds) {
    return fail('Use labelIds when creating an issue.', 'labelIds');
  }

  const ctx = await loadContext(projectId, actor.userId, patch, []);
  if (!ctx) return fail('Project not found.');
  const check = resolvePatch(ctx, patch);
  if (!check.ok) return check;
  const { resolved } = check;

  const state = resolved.state ?? defaultNewIssueState(ctx.states);
  if (!state) return fail('This project has no workflow states.', 'stateId');

  const now = new Date();
  const timestamps = stateTransitionTimestamps(
    null,
    state.type,
    { startedAt: null, completedAt: null, canceledAt: null },
    now,
  );
  const id = crypto.randomUUID();
  const labelList = resolved.labels ?? [];
  const slaDueAt = slaDeadline(ctx.project.slaPolicy, patch.priority ?? 'none', now);
  const epicId = resolved.milestoneEpicId ?? patch.epicId ?? null;

  // The counter UPDATE row-locks the project for the batch's transaction, so
  // concurrent creates get distinct numbers; unique(project_id, ticket_number)
  // is the backstop. The insert reads the bumped counter in the same transaction.
  const counter = sql<number>`(select ${projects.ticketCounter} from ${projects} where ${projects.id} = ${projectId})`;
  const bump = db
    .update(projects)
    .set({ ticketCounter: sql`${projects.ticketCounter} + 1` })
    .where(eq(projects.id, projectId))
    .returning({ number: projects.ticketCounter });
  const insert = db.insert(tickets).values({
    id,
    projectId,
    ticketNumber: counter,
    title: patch.title,
    description: patch.description ?? null,
    stateId: state.id,
    priority: patch.priority ?? 'none',
    estimate: patch.estimate ?? null,
    startDate: patch.startDate ?? null,
    dueDate: patch.dueDate ?? null,
    slaDueAt,
    stateChangedAt: now,
    assigneeId: resolved.assignee?.id ?? null,
    creatorId: ctx.actor?.id ?? null,
    parentId: patch.parentId ?? null,
    // New issues sort like migrated ones (sort_order = number) unless placed.
    sortOrder: patch.sortOrder ?? counter,
    cycleId: patch.cycleId ?? null,
    epicId,
    milestoneId: patch.milestoneId ?? null,
    ...timestamps,
    createdAt: now,
    updatedAt: now,
  });

  const [[bumped]] = labelList.length
    ? await db.batch([
        bump,
        insert,
        db.insert(issueLabels).values(labelList.map((l) => ({ ticketId: id, labelId: l.id }))),
      ])
    : await db.batch([bump, insert]);
  if (!bumped) return fail('Project not found.');

  const issue: IssueRow = {
    id,
    projectId,
    key: `${ctx.project.ticketKey}-${bumped.number}`,
    number: bumped.number,
    title: patch.title,
    description: patch.description ?? null,
    stateId: state.id,
    state,
    priority: patch.priority ?? 'none',
    estimate: patch.estimate ?? null,
    startDate: patch.startDate ?? null,
    dueDate: patch.dueDate ?? null,
    slaDueAt,
    slaBreachedAt: null,
    stateChangedAt: now,
    assignee: resolved.assignee ?? null,
    creator: ctx.actor,
    labels: labelList,
    parentId: patch.parentId ?? null,
    sortOrder: patch.sortOrder ?? bumped.number,
    cycleId: patch.cycleId ?? null,
    epicId,
    milestoneId: patch.milestoneId ?? null,
    githubBranch: null,
    ...timestamps,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await emitIssueEvent({
    projectId,
    ticketId: id,
    actorId: actor.userId,
    type: ISSUE_EVENT.created,
    data: {
      key: issue.key,
      title: issue.title,
      ...(opts?.source === 'import' ? { bulk: true } : {}),
    },
  });
  return { ok: true, issue };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/**
 * Apply one patch to several issues of a project (all-or-nothing). Deleted
 * issues can't be edited; archived ones can. Issues the patch doesn't change
 * are returned untouched and get no activity.
 */
export interface UpdateIssueOptions {
  /**
   * Extra fields merged into each `issue.updated` event's data (e.g. the
   * GitHub sync's `viaPullRequest`, which lets dispatchers tell an automated
   * move from a manual one). Can't override key / title / changes.
   */
  eventData?: Record<string, unknown>;
}

export async function bulkUpdate(
  actor: IssueActor,
  projectId: string,
  ids: string[],
  patch: IssuePatch,
  opts?: UpdateIssueOptions,
): Promise<IssuesResult> {
  if (!projectId) return NOT_FOUND;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string' && id)) return NOT_FOUND;
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return { ok: true, issues: [] };
  if (uniqueIds.length > BULK_MAX) return fail(`At most ${BULK_MAX} issues at a time.`);

  const normalized = normalizePatch(patch);
  if (!normalized.ok) return normalized;

  const ctx = await loadContext(projectId, actor.userId, normalized.patch, uniqueIds);
  if (!ctx) return NOT_FOUND;
  const issues = ctx.issues.filter((issue) => issue.deletedAt === null);
  if (issues.length !== uniqueIds.length) return NOT_FOUND;

  const check = resolvePatch(ctx, normalized.patch);
  if (!check.ok) return check;

  const now = new Date();
  const results = issues.map((old) => ({
    old,
    ...applyToIssue(ctx, old, normalized.patch, check.resolved, now),
  }));
  const changed = results.filter(
    (r) => r.changes.length > 0 || r.next.sortOrder !== r.old.sortOrder,
  );
  if (changed.length === 0) return { ok: true, issues };
  if (changed.some((r) => r.next.labels !== r.old.labels && r.next.labels.length > LABELS_MAX)) {
    return fail(`At most ${LABELS_MAX} labels.`, 'addLabelIds');
  }

  const statements: BatchItem<'pg'>[] = changed.map(({ old, set }) =>
    db
      .update(tickets)
      .set({ ...set, updatedAt: now })
      .where(and(eq(tickets.id, old.id), eq(tickets.projectId, projectId))),
  );

  const relabeled = changed.filter((r) => r.changes.some((c) => c.field === 'labelIds'));
  if (relabeled.length && check.resolved.labels) {
    const relabeledIds = relabeled.map((r) => r.old.id);
    statements.push(db.delete(issueLabels).where(inArray(issueLabels.ticketId, relabeledIds)));
    if (check.resolved.labels.length) {
      statements.push(
        db.insert(issueLabels).values(
          relabeledIds.flatMap((ticketId) =>
            check.resolved.labels!.map((label) => ({ ticketId, labelId: label.id })),
          ),
        ),
      );
    }
  } else if (relabeled.length && check.resolved.labelDelta) {
    const { remove } = check.resolved.labelDelta;
    if (remove.size) {
      statements.push(
        db
          .delete(issueLabels)
          .where(
            and(
              inArray(issueLabels.ticketId, relabeled.map((r) => r.old.id)),
              inArray(issueLabels.labelId, [...remove]),
            ),
          ),
      );
    }
    const rows = relabeled.flatMap((r) => {
      const had = new Set(r.old.labels.map((l) => l.id));
      return r.next.labels
        .filter((l) => !had.has(l.id))
        .map((l) => ({ ticketId: r.old.id, labelId: l.id }));
    });
    if (rows.length) statements.push(db.insert(issueLabels).values(rows).onConflictDoNothing());
  }

  const events: IssueEventInput[] = changed
    .filter((r) => r.changes.length > 0)
    .map((r) => ({
      projectId,
      ticketId: r.old.id,
      actorId: actor.userId,
      type: ISSUE_EVENT.updated,
      data: { ...opts?.eventData, key: r.old.key, title: r.next.title, changes: r.changes },
    }));
  const prepared = events.length ? prepareIssueEvents(events) : null;
  if (prepared) statements.push(prepared.insert);

  await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]]);
  if (prepared) publishIssueEvents(prepared.stored);

  const nextById = new Map(changed.map((r) => [r.old.id, { ...r.next, updatedAt: now }]));
  return { ok: true, issues: issues.map((issue) => nextById.get(issue.id) ?? issue) };
}

export async function updateIssueFields(
  actor: IssueActor,
  projectId: string,
  id: string,
  patch: IssuePatch,
  opts?: UpdateIssueOptions,
): Promise<IssueResult> {
  const result = await bulkUpdate(actor, projectId, [id], patch, opts);
  if (!result.ok) return result;
  const [issue] = result.issues;
  return issue ? { ok: true, issue } : NOT_FOUND;
}

// ---------------------------------------------------------------------------
// Archive / trash lifecycle
// ---------------------------------------------------------------------------

type Lifecycle = 'archive' | 'unarchive' | 'softDelete' | 'restore';

/**
 * Archive / unarchive / trash / restore several issues of a project in one
 * batch (all-or-nothing). Issues already in the target state are returned
 * untouched and get no activity.
 */
async function changeLifecycle(
  actor: IssueActor,
  projectId: string,
  ids: string[],
  kind: Lifecycle,
): Promise<IssuesResult> {
  if (!projectId) return NOT_FOUND;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string' && id)) return NOT_FOUND;
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return { ok: true, issues: [] };
  if (uniqueIds.length > BULK_MAX) return fail(`At most ${BULK_MAX} issues at a time.`);

  const olds = await queryIssues(
    and(eq(tickets.projectId, projectId), inArray(tickets.id, uniqueIds)),
  );
  if (olds.length !== uniqueIds.length) return NOT_FOUND;

  const now = new Date();
  const changes: { old: IssueRow; set: Pick<TicketSet, 'archivedAt' | 'deletedAt'> }[] = [];
  let type: string;
  switch (kind) {
    case 'archive':
      if (olds.some((old) => old.deletedAt)) return NOT_FOUND;
      type = ISSUE_EVENT.archived;
      for (const old of olds) if (!old.archivedAt) changes.push({ old, set: { archivedAt: now } });
      break;
    case 'unarchive':
      type = ISSUE_EVENT.unarchived;
      for (const old of olds) if (old.archivedAt) changes.push({ old, set: { archivedAt: null } });
      break;
    case 'softDelete':
      type = ISSUE_EVENT.deleted;
      for (const old of olds) if (!old.deletedAt) changes.push({ old, set: { deletedAt: now } });
      break;
    case 'restore':
      type = ISSUE_EVENT.restored;
      for (const old of olds) {
        if (old.deletedAt || old.archivedAt) {
          changes.push({ old, set: { deletedAt: null, archivedAt: null } });
        }
      }
      break;
  }
  if (changes.length === 0) return { ok: true, issues: olds };

  const { stored, insert } = prepareIssueEvents(
    changes.map(({ old }) => ({
      projectId,
      ticketId: old.id,
      actorId: actor.userId,
      type,
      data: { key: old.key, title: old.title },
    })),
  );
  // Every change in one kind shares its `set`, so one UPDATE covers them all.
  await db.batch([
    db
      .update(tickets)
      .set({ ...changes[0].set, updatedAt: now })
      .where(
        and(
          eq(tickets.projectId, projectId),
          inArray(tickets.id, changes.map(({ old }) => old.id)),
        ),
      ),
    insert,
  ]);
  publishIssueEvents(stored);

  const nextById = new Map(
    changes.map(({ old, set }) => [old.id, { ...old, ...set, updatedAt: now } as IssueRow]),
  );
  return { ok: true, issues: olds.map((old) => nextById.get(old.id) ?? old) };
}

async function changeOne(
  actor: IssueActor,
  projectId: string,
  id: string,
  kind: Lifecycle,
): Promise<IssueResult> {
  if (typeof id !== 'string' || !id) return NOT_FOUND;
  const result = await changeLifecycle(actor, projectId, [id], kind);
  if (!result.ok) return result;
  const [issue] = result.issues;
  return issue ? { ok: true, issue } : NOT_FOUND;
}

/** Hide from lists; still reachable by key / archive page. */
export const archive = (actor: IssueActor, projectId: string, id: string) =>
  changeOne(actor, projectId, id, 'archive');

export const unarchive = (actor: IssueActor, projectId: string, id: string) =>
  changeOne(actor, projectId, id, 'unarchive');

/** Move to trash (deletedAt). Restorable until purged. */
export const softDelete = (actor: IssueActor, projectId: string, id: string) =>
  changeOne(actor, projectId, id, 'softDelete');

/** Back to the active list: clears deletedAt AND archivedAt. */
export const restore = (actor: IssueActor, projectId: string, id: string) =>
  changeOne(actor, projectId, id, 'restore');

// Batched twins (≤ BULK_MAX ids, all-or-nothing, one write batch).
export const archiveMany = (actor: IssueActor, projectId: string, ids: string[]) =>
  changeLifecycle(actor, projectId, ids, 'archive');

export const unarchiveMany = (actor: IssueActor, projectId: string, ids: string[]) =>
  changeLifecycle(actor, projectId, ids, 'unarchive');

export const softDeleteMany = (actor: IssueActor, projectId: string, ids: string[]) =>
  changeLifecycle(actor, projectId, ids, 'softDelete');

export const restoreMany = (actor: IssueActor, projectId: string, ids: string[]) =>
  changeLifecycle(actor, projectId, ids, 'restore');

/**
 * Permanent delete. Callers must require admin. The issue's own activity rows
 * cascade away; the purge event is stored project-level (ticketId null).
 */
export async function purge(actor: IssueActor, projectId: string, id: string): Promise<PurgeResult> {
  if (!projectId || typeof id !== 'string' || !id) return NOT_FOUND;
  const [old] = await db
    .select({ id: tickets.id, number: tickets.ticketNumber, title: tickets.title, key: projects.ticketKey })
    .from(tickets)
    .innerJoin(projects, eq(tickets.projectId, projects.id))
    .where(and(eq(tickets.projectId, projectId), eq(tickets.id, id)))
    .limit(1);
  if (!old) return NOT_FOUND;

  const { stored, insert } = prepareIssueEvents([
    {
      projectId,
      ticketId: null,
      actorId: actor.userId,
      type: ISSUE_EVENT.purged,
      data: { ticketId: old.id, key: `${old.key}-${old.number}`, title: old.title },
    },
  ]);
  await db.batch([
    db.delete(tickets).where(and(eq(tickets.id, old.id), eq(tickets.projectId, projectId))),
    insert,
  ]);
  publishIssueEvents(stored);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Move to another project (.planning/features/D4a-move-issues.md)
// ---------------------------------------------------------------------------

export const ISSUE_MOVED_EVENT = 'issue.moved';

export type MoveIssueResult =
  | {
      ok: true;
      /** The moved issue, as it now reads in the target project. */
      issue: IssueRow;
      fromKey: string;
      /** Issues moved, sub-issues included. */
      moved: number;
      /** Label names the target project doesn't have (dropped). */
      droppedLabels: string[];
    }
  | IssueServiceError;

/**
 * Move an issue — with all of its sub-issues, so a parent never lives in
 * another project — from `fromProjectId` to `toProjectId`. Callers MUST
 * authorize write access in BOTH projects. Each issue gets the next number in
 * the target and its old key is kept as a `ticket_key_alias`. State maps by
 * name → type → default; labels by name (unmatched are dropped); assignee kept
 * if a target member; cycle cleared; epic + milestone kept only when the epic
 * is available to the target (epicAvailableTo). Comments, attachments,
 * relations, subscribers, PR links, notifications and activity come along.
 */
export async function moveIssue(
  actor: IssueActor,
  fromProjectId: string,
  id: string,
  toProjectId: string,
): Promise<MoveIssueResult> {
  if (!fromProjectId || !toProjectId || typeof id !== 'string' || !id) return NOT_FOUND;
  if (fromProjectId === toProjectId) return fail('The issue is already in that project.');

  // The issue and every descendant (depth-capped against bad data), all in the
  // source project.
  const inTree = and(
    eq(tickets.projectId, fromProjectId),
    sql`${tickets.id} in (
      with recursive tree(id, depth) as (
        select t.id, 0 from ${tickets} t where t.id = ${id} and t.project_id = ${fromProjectId}
        union all
        select c.id, tree.depth + 1 from ${tickets} c join tree on c.parent_id = tree.id
        where tree.depth < 50
      )
      select id from tree
    )`,
  )!;
  const treeEpicIds = db.select({ epicId: tickets.epicId }).from(tickets).where(inTree);

  const [issueRows, issueLabelRows, targetRows, stateRows, labelRows, memberRows, epicRows] =
    await db.batch([
      ...issueQueries(inTree, { orderBy: [asc(tickets.ticketNumber)] }),
      db
        .select({
          ticketKey: projects.ticketKey,
          estimateScale: projects.estimateScale,
          slaPolicy: projects.slaPolicy,
        })
        .from(projects)
        .where(eq(projects.id, toProjectId))
        .limit(1),
      db
        .select({
          id: workflowStates.id,
          name: workflowStates.name,
          type: workflowStates.type,
          color: workflowStates.color,
          position: workflowStates.position,
          description: workflowStates.description,
        })
        .from(workflowStates)
        .where(eq(workflowStates.projectId, toProjectId)),
      db
        .select({ id: labels.id, name: labels.name, color: labels.color })
        .from(labels)
        .where(eq(labels.projectId, toProjectId)),
      db
        .select({ userId: projectMembers.userId })
        .from(projectMembers)
        .where(eq(projectMembers.projectId, toProjectId)),
      db
        .select({ id: epics.id })
        .from(epics)
        .where(and(inArray(epics.id, treeEpicIds), epicAvailableTo(toProjectId, actor.userId))),
    ]);

  const all = mergeIssueRows(issueRows, issueLabelRows);
  const root = all.find((issue) => issue.id === id);
  if (!root) return NOT_FOUND;
  if (root.deletedAt) return fail('Restore the issue before moving it.');
  if (all.length > BULK_MAX) {
    return fail(`Too many sub-issues to move at once (at most ${BULK_MAX} issues).`);
  }
  const [target] = targetRows;
  if (!target) return fail('Project not found.');
  const states = sortStates(stateRows);
  if (states.length === 0) return fail('That project has no workflow states.');

  // Root first, then sub-issues in their old order.
  const ordered = [root, ...all.filter((issue) => issue.id !== id)];
  const treeIds = ordered.map((issue) => issue.id);
  const stateByName = new Map(states.map((s) => [s.name.toLowerCase(), s]));
  const labelByName = new Map(labelRows.map((l) => [l.name.toLowerCase(), l]));
  const memberIds = new Set(memberRows.map((m) => m.userId));
  const keptEpics = new Set(epicRows.map((e) => e.id));
  const dropped = new Set<string>();
  const now = new Date();
  const count = ordered.length;
  const counter = sql<number>`(select ${projects.ticketCounter} from ${projects} where ${projects.id} = ${toProjectId})`;

  const plans = ordered.map((old, i) => {
    const state =
      stateByName.get(old.state.name.toLowerCase()) ??
      firstStateOfType(states, old.state.type) ??
      defaultNewIssueState(states) ??
      states[0];
    const labelsKept: IssueLabel[] = [];
    for (const label of old.labels) {
      const match = labelByName.get(label.name.toLowerCase());
      if (match) labelsKept.push(match);
      else dropped.add(label.name);
    }
    const keepEpic = old.epicId !== null && keptEpics.has(old.epicId);
    const typeChanged = state.type !== old.state.type;
    const timestamps = typeChanged
      ? stateTransitionTimestamps(old.state.type, state.type, old, now)
      : { startedAt: old.startedAt, completedAt: old.completedAt, canceledAt: old.canceledAt };
    const number = sql<number>`${counter} - ${count - 1 - i}::int`;
    const set: PgUpdateSetSource<typeof tickets> = {
      projectId: toProjectId,
      ticketNumber: number,
      sortOrder: number,
      stateId: state.id,
      ...timestamps,
      stateChangedAt: typeChanged ? now : old.stateChangedAt,
      assigneeId: old.assignee && memberIds.has(old.assignee.id) ? old.assignee.id : null,
      // The root's parent stays behind; sub-issues keep theirs (moved too).
      parentId: i === 0 ? null : old.parentId,
      cycleId: null,
      epicId: keepEpic ? old.epicId : null,
      milestoneId: keepEpic ? old.milestoneId : null,
      estimate:
        old.estimate !== null && isValidEstimate(target.estimateScale, old.estimate)
          ? old.estimate
          : null,
      slaDueAt: slaDeadline(target.slaPolicy, old.priority, old.createdAt),
      slaBreachedAt: null,
      updatedAt: now,
    };
    return { old, set, labels: labelsKept };
  });

  const bump = db
    .update(projects)
    .set({ ticketCounter: sql`${projects.ticketCounter} + ${count}::int`, updatedAt: now })
    .where(eq(projects.id, toProjectId))
    .returning({ number: projects.ticketCounter });
  const labelInserts = plans.flatMap((p) =>
    p.labels.map((label) => ({ ticketId: p.old.id, labelId: label.id })),
  );
  const statements: BatchItem<'pg'>[] = [
    ...plans.map(({ old, set }) =>
      db
        .update(tickets)
        .set(set)
        .where(and(eq(tickets.id, old.id), eq(tickets.projectId, fromProjectId))),
    ),
    db.delete(issueLabels).where(inArray(issueLabels.ticketId, treeIds)),
    ...(labelInserts.length ? [db.insert(issueLabels).values(labelInserts)] : []),
    db
      .insert(ticketKeyAliases)
      .values(ordered.map((old) => ({ key: old.key, ticketId: old.id, createdAt: now })))
      .onConflictDoUpdate({
        target: ticketKeyAliases.key,
        set: { ticketId: sql`excluded.ticket_id` },
      }),
    // History, PR links and inbox entries follow the issue to its new project.
    db.update(activities).set({ projectId: toProjectId }).where(inArray(activities.ticketId, treeIds)),
    db
      .update(githubPullRequests)
      .set({ projectId: toProjectId })
      .where(inArray(githubPullRequests.ticketId, treeIds)),
    db
      .update(notifications)
      .set({ projectId: toProjectId })
      .where(inArray(notifications.ticketId, treeIds)),
  ];
  const [[bumped]] = await db.batch([bump, ...statements]);
  if (!bumped) return fail('Project not found.');

  const keyOf = (i: number) => `${target.ticketKey}-${bumped.number - (count - 1 - i)}`;
  const droppedLabels = [...dropped].sort();
  const toKey = keyOf(0);
  await emitIssueEvent([
    {
      projectId: fromProjectId,
      ticketId: null,
      actorId: actor.userId,
      type: ISSUE_MOVED_EVENT,
      data: {
        ticketId: root.id,
        key: root.key,
        title: root.title,
        fromKey: root.key,
        toKey,
        toProjectId,
        moved: count,
        summary: `moved ${root.key} to ${toKey}`,
      },
    },
    ...ordered.map((old, i) => ({
      projectId: toProjectId,
      ticketId: old.id,
      actorId: actor.userId,
      type: ISSUE_MOVED_EVENT,
      data: {
        key: keyOf(i),
        title: old.title,
        fromKey: old.key,
        toKey: keyOf(i),
        fromProjectId,
        toProjectId,
        droppedLabels: old.labels
          .filter((l) => !labelByName.has(l.name.toLowerCase()))
          .map((l) => l.name),
        ...(i > 0 ? { withParent: root.key } : {}),
        summary: `moved from ${old.key}`,
      },
    })),
  ]);

  const [issue] = await queryIssues(and(eq(tickets.id, id), eq(tickets.projectId, toProjectId)), {
    limit: 1,
  });
  if (!issue) return NOT_FOUND;
  return { ok: true, issue, fromKey: root.key, moved: count, droppedLabels };
}
