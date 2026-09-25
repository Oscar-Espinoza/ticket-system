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

import { and, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core';
import type { BatchItem } from 'drizzle-orm/batch';

import { db } from '@/lib/db';
import {
  cycles,
  epics,
  issueLabels,
  labels,
  milestones,
  projectMembers,
  projects,
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
import { issueQueries, mergeIssueRows, queryIssues } from '@/lib/tickets';
import { defaultNewIssueState, sortStates, stateTransitionTimestamps } from '@/lib/workflow';

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
  project: { id: string; ticketKey: string; estimateScale: string };
  states: WorkflowState[];
  issues: IssueRow[];
  labels: Map<string, IssueLabel>;
  assignee: IssueUser | null;
  parents: Map<string, ParentRef>;
  cycles: Map<string, Named>;
  epics: Map<string, Named>;
  milestones: Map<string, Named & { epicId: string }>;
  /** Issues (of `issueIds`) that are the new parent or one of its ancestors. */
  cyclic: Set<string>;
  actor: IssueUser | null;
}

const NOTHING = sql`false`;

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
    db
      .select({ id: epics.id, name: epics.name })
      .from(epics)
      .where(and(eq(epics.projectId, projectId), refCond(epics.id, patch.epicId, src.epicId))),
    db
      .select({ id: milestones.id, name: milestones.name, epicId: milestones.epicId })
      .from(milestones)
      .innerJoin(epics, eq(milestones.epicId, epics.id))
      .where(
        and(
          eq(epics.projectId, projectId),
          refCond(milestones.id, patch.milestoneId, src.milestoneId),
        ),
      ),
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
  if (patch.epicId && !ctx.epics.has(patch.epicId)) return fail('Invalid epic.', 'epicId');
  if (patch.milestoneId) {
    const milestone = ctx.milestones.get(patch.milestoneId);
    if (!milestone) return fail('Invalid milestone.', 'milestoneId');
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

  for (const field of ['title', 'description', 'priority', 'estimate', 'dueDate', 'parentId', 'cycleId', 'sortOrder'] as const) {
    if (patch[field] !== undefined) {
      (set as Record<string, unknown>)[field] = patch[field];
      (next as unknown as Record<string, unknown>)[field] = patch[field];
    }
  }
  if (resolved.state) {
    const timestamps = stateTransitionTimestamps(old.state.type, resolved.state.type, old, now);
    Object.assign(set, { stateId: resolved.state.id }, timestamps);
    Object.assign(next, { stateId: resolved.state.id, state: resolved.state }, timestamps);
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
    dueDate: patch.dueDate ?? null,
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
    dueDate: patch.dueDate ?? null,
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
