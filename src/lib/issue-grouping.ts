// Group and order issues for the list, board and table views. Each group
// carries the patch that puts an issue INTO it, so dropping a card on a column
// or creating from a group's "+" is just mutations.update / create with it.

import {
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  type IssuePatch,
  type IssueRow,
  type IssueUser,
  type Priority,
  type WorkflowState,
} from '@/lib/issue-model';
import type { ProjectData } from '@/lib/project-data-types';

export type GroupBy = 'state' | 'assignee' | 'priority' | 'label' | 'cycle' | 'epic' | 'none';

export const GROUP_BY_OPTIONS: GroupBy[] = ['state', 'assignee', 'priority', 'label', 'cycle', 'epic', 'none'];

export const GROUP_BY_LABEL: Record<GroupBy, string> = {
  state: 'Status',
  assignee: 'Assignee',
  priority: 'Priority',
  label: 'Label',
  cycle: 'Cycle',
  epic: 'Epic',
  none: 'No grouping',
};

export function isGroupBy(value: unknown): value is GroupBy {
  return typeof value === 'string' && (GROUP_BY_OPTIONS as string[]).includes(value);
}

export type OrderBy = 'manual' | 'priority' | 'created' | 'updated' | 'dueDate' | 'title';

export const ORDER_BY_OPTIONS: OrderBy[] = ['manual', 'priority', 'created', 'updated', 'dueDate', 'title'];

export const ORDER_BY_LABEL: Record<OrderBy, string> = {
  manual: 'Manual',
  priority: 'Priority',
  created: 'Created',
  updated: 'Updated',
  dueDate: 'Due date',
  title: 'Title',
};

export function isOrderBy(value: unknown): value is OrderBy {
  return typeof value === 'string' && (ORDER_BY_OPTIONS as string[]).includes(value);
}

/** Id of every "No …" group (no assignee / label / cycle / epic, no priority). */
export const NO_VALUE_GROUP = 'none';

export interface IssueGroup {
  /** Stable within a grouping: state id, user id, 'none', … */
  id: string;
  label: string;
  kind: GroupBy;
  /** Set for kind 'state' (glyph + color in headers). */
  state?: WorkflowState;
  /** Set for kind 'priority'. */
  priority?: Priority;
  /** Set for kind 'assignee' (null = "No assignee"). */
  user?: IssueUser | null;
  /** Accent color for the header (hex). */
  color?: string;
  /** Applied when an issue is dropped / created in this group; null = not droppable. */
  patch: IssuePatch | null;
  /** In input order — sort before grouping. */
  issues: IssueRow[];
  /** Second-level groups (sub-grouping), when requested. */
  subgroups?: IssueGroup[];
}

export type GroupingData = Pick<ProjectData, 'states'> &
  Partial<Pick<ProjectData, 'members' | 'labels' | 'cycles' | 'epics'>> & {
    project: Pick<ProjectData['project'], 'triageEnabled'>;
  };

function byState(issues: IssueRow[], data: GroupingData): IssueGroup[] {
  const buckets = new Map<string, IssueRow[]>(data.states.map((s) => [s.id, []]));
  for (const issue of issues) buckets.get(issue.stateId)?.push(issue);
  return data.states
    .map((state) => ({
      id: state.id,
      label: state.name,
      kind: 'state' as const,
      state,
      color: state.color,
      patch: { stateId: state.id },
      issues: buckets.get(state.id) ?? [],
    }))
    .filter((group) => group.state.type !== 'triage' || data.project.triageEnabled || group.issues.length > 0);
}

interface Bucket {
  id: string;
  label: string;
  patch: IssuePatch;
  color?: string;
  user?: IssueUser | null;
  priority?: Priority;
}

/**
 * Generic bucketing: known buckets first (in their order), then buckets found
 * only on issues (e.g. a removed member), then the "No …" bucket last.
 */
function bucketed(
  issues: IssueRow[],
  kind: GroupBy,
  known: Bucket[],
  none: Bucket,
  keysOf: (issue: IssueRow) => string[],
  fromIssue: (issue: IssueRow, key: string) => Bucket | null,
): IssueGroup[] {
  const buckets = new Map<string, Bucket>(known.map((b) => [b.id, b]));
  const members = new Map<string, IssueRow[]>();
  for (const issue of issues) {
    const keys = keysOf(issue);
    for (const key of keys.length ? keys : [NO_VALUE_GROUP]) {
      if (!buckets.has(key) && key !== NO_VALUE_GROUP) {
        const found = fromIssue(issue, key);
        if (!found) continue;
        buckets.set(key, found);
      }
      const list = members.get(key);
      if (list) list.push(issue);
      else members.set(key, [issue]);
    }
  }
  return [...buckets.values(), none].map((bucket) => ({
    ...bucket,
    kind,
    issues: members.get(bucket.id) ?? [],
  }));
}

export function groupIssues(issues: IssueRow[], groupBy: GroupBy, data: GroupingData): IssueGroup[] {
  switch (groupBy) {
    case 'state':
      return byState(issues, data);

    case 'assignee':
      return bucketed(
        issues,
        'assignee',
        (data.members ?? []).map((m) => {
          const user = { id: m.id, name: m.name, image: m.image };
          return { id: m.id, label: m.name, user, patch: { assigneeId: m.id } };
        }),
        { id: NO_VALUE_GROUP, label: 'No assignee', user: null, patch: { assigneeId: null } },
        (issue) => (issue.assignee ? [issue.assignee.id] : []),
        (issue) =>
          issue.assignee && {
            id: issue.assignee.id,
            label: issue.assignee.name,
            user: issue.assignee,
            patch: { assigneeId: issue.assignee.id },
          },
      );

    case 'priority': {
      const groups = PRIORITY_ORDER.map((priority) => ({
        id: priority,
        label: PRIORITY_LABEL[priority],
        kind: 'priority' as const,
        priority,
        patch: { priority },
        issues: [] as IssueRow[],
      }));
      for (const issue of issues) groups.find((g) => g.priority === issue.priority)?.issues.push(issue);
      return groups;
    }

    case 'label':
      return bucketed(
        issues,
        'label',
        (data.labels ?? []).map((l) => ({ id: l.id, label: l.name, color: l.color, patch: { labelIds: [l.id] } })),
        { id: NO_VALUE_GROUP, label: 'No label', patch: { labelIds: [] } },
        (issue) => issue.labels.map((l) => l.id),
        (issue, key) => {
          const label = issue.labels.find((l) => l.id === key);
          return label ? { id: label.id, label: label.name, color: label.color, patch: { labelIds: [label.id] } } : null;
        },
      );

    case 'cycle': {
      const withIssues = new Set(issues.map((i) => i.cycleId));
      return bucketed(
        issues,
        'cycle',
        (data.cycles ?? [])
          // Finished cycles only matter while they still hold (filtered) issues.
          .filter((c) => !c.completedAt || withIssues.has(c.id))
          .map((c) => ({ id: c.id, label: c.name || `Cycle ${c.number}`, patch: { cycleId: c.id } })),
        { id: NO_VALUE_GROUP, label: 'No cycle', patch: { cycleId: null } },
        (issue) => (issue.cycleId ? [issue.cycleId] : []),
        // A cycle unknown to project data (shouldn't happen) is left out.
        () => null,
      );
    }

    case 'epic':
      return bucketed(
        issues,
        'epic',
        (data.epics ?? []).map((e) => ({
          id: e.id,
          label: e.name,
          color: e.color ?? undefined,
          patch: { epicId: e.id },
        })),
        { id: NO_VALUE_GROUP, label: 'No epic', patch: { epicId: null } },
        (issue) => (issue.epicId ? [issue.epicId] : []),
        () => null,
      );

    case 'none':
      return [{ id: 'all', label: 'All issues', kind: 'none', patch: null, issues }];
  }
}

/** Fill `subgroups` of each group (same shape, second-level grouping). */
export function subGroupIssues(groups: IssueGroup[], subGroupBy: GroupBy | null, data: GroupingData): IssueGroup[] {
  if (!subGroupBy || subGroupBy === 'none') return groups;
  return groups.map((group) =>
    group.kind === subGroupBy ? group : { ...group, subgroups: groupIssues(group.issues, subGroupBy, data) },
  );
}

/** Both patches applied together (a board cell = column + swimlane). */
export function mergePatches(a: IssuePatch | null, b: IssuePatch | null): IssuePatch | null {
  if (!a && !b) return null;
  return { ...a, ...b };
}

/**
 * The patch that moves `issue` into `target` coming from `source`. Labels are
 * additive: leaving label A for label B swaps A for B and keeps the rest;
 * "No label" clears them all. Everything else is the target's patch.
 */
export function patchForMove(issue: IssueRow, target: IssueGroup, source?: IssueGroup | null): IssuePatch | null {
  if (!target.patch) return null;
  if (target.kind !== 'label') return target.patch;
  if (target.id === NO_VALUE_GROUP) return { labelIds: [] };
  const leaving = source?.kind === 'label' && source.id !== target.id ? source.id : null;
  const ids = issue.labels.map((l) => l.id).filter((id) => id !== leaving);
  return { labelIds: ids.includes(target.id) ? ids : [...ids, target.id] };
}

/**
 * Moving between nested groups ([group, sub-group] paths): the patch for each
 * level that changed, combined; null when a level can't be dropped into.
 */
export function patchForNestedMove(issue: IssueRow, to: IssueGroup[], from: IssueGroup[]): IssuePatch | null {
  let patch: IssuePatch = {};
  for (const [level, target] of to.entries()) {
    const source = from[level] ?? null;
    if (source?.id === target.id) continue;
    const step = patchForMove(issue, target, source);
    if (!step) return null;
    patch = { ...patch, ...step };
  }
  return patch;
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

const time = (date: Date) => new Date(date).getTime();
const newestFirst = (a: IssueRow, b: IssueRow) => b.number - a.number;

const COMPARATORS: Record<OrderBy, (a: IssueRow, b: IssueRow) => number> = {
  manual: (a, b) => a.sortOrder - b.sortOrder || a.number - b.number,
  priority: (a, b) =>
    PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) || newestFirst(a, b),
  created: (a, b) => time(b.createdAt) - time(a.createdAt) || newestFirst(a, b),
  updated: (a, b) => time(b.updatedAt) - time(a.updatedAt) || newestFirst(a, b),
  dueDate: (a, b) => {
    if (a.dueDate === b.dueDate) return newestFirst(a, b);
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  },
  title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || newestFirst(a, b),
};

/** A sorted copy; group after sorting so groups keep the order. */
export function sortIssues(issues: IssueRow[], orderBy: OrderBy): IssueRow[] {
  return [...issues].sort(COMPARATORS[orderBy]);
}

/** A sortOrder between two neighbours (either may be missing at the ends). */
export function sortOrderBetween(prev: number | undefined, next: number | undefined): number {
  if (prev !== undefined && next !== undefined) return (prev + next) / 2;
  if (prev !== undefined) return prev + 1;
  if (next !== undefined) return next - 1;
  return 0;
}
