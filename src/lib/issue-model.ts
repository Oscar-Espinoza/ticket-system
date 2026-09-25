// The one issue shape the list, board, detail and every Wave B surface consume.
// Client-safe: no server imports here.

// ---------------------------------------------------------------------------
// Workflow states
// ---------------------------------------------------------------------------

/** Linear's workflow state categories — mirrors the workflow_state_type DB enum. */
export type StateType =
  | 'triage'
  | 'backlog'
  | 'unstarted'
  | 'started'
  | 'completed'
  | 'canceled';

export const STATE_TYPE_ORDER: StateType[] = [
  'triage',
  'backlog',
  'unstarted',
  'started',
  'completed',
  'canceled',
];

export const STATE_TYPE_LABEL: Record<StateType, string> = {
  triage: 'Triage',
  backlog: 'Backlog',
  unstarted: 'Unstarted',
  started: 'Started',
  completed: 'Completed',
  canceled: 'Canceled',
};

export function isStateType(value: unknown): value is StateType {
  return typeof value === 'string' && Object.hasOwn(STATE_TYPE_LABEL, value);
}

export interface WorkflowState {
  id: string;
  name: string;
  type: StateType;
  /** Hex, e.g. "#e5a100". */
  color: string;
  /** Order within the project (sortStates orders by type first, then this). */
  position: number;
  description: string | null;
}

// ---------------------------------------------------------------------------
// Priority
// ---------------------------------------------------------------------------

/** Mirrors the issue_priority DB enum. */
export type Priority = 'none' | 'urgent' | 'high' | 'medium' | 'low';

/** Display / sort order: most urgent first, "No priority" last. */
export const PRIORITY_ORDER: Priority[] = ['urgent', 'high', 'medium', 'low', 'none'];

export const PRIORITY_LABEL: Record<Priority, string> = {
  none: 'No priority',
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function isPriority(value: unknown): value is Priority {
  return typeof value === 'string' && Object.hasOwn(PRIORITY_LABEL, value);
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

export interface IssueUser {
  id: string;
  name: string;
  image: string | null;
}

/** @deprecated alias kept for older call sites — use IssueUser. */
export type IssueAssignee = IssueUser;

export interface IssueLabel {
  id: string;
  name: string;
  /** Hex, e.g. "#5e6ad2". */
  color: string;
}

export interface IssueRow {
  id: string;
  projectId: string;
  /** "ENG-12" */
  key: string;
  number: number;
  title: string;
  description: string | null;
  stateId: string;
  state: WorkflowState;
  priority: Priority;
  estimate: number | null;
  /** Calendar date, YYYY-MM-DD (no timezone). */
  dueDate: string | null;
  assignee: IssueUser | null;
  creator: IssueUser | null;
  labels: IssueLabel[];
  parentId: string | null;
  sortOrder: number;
  cycleId: string | null;
  epicId: string | null;
  milestoneId: string | null;
  githubBranch: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  canceledAt: Date | null;
  archivedAt: Date | null;
  /** Soft delete (trash). Regular lists never include these. */
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A change to one or more issues. Absent keys are untouched; `null` clears.
 * `labelIds` is the full replacement set; `addLabelIds` / `removeLabelIds` are
 * per-issue deltas (keep the rest) and can't be combined with `labelIds`.
 */
export interface IssuePatch {
  title?: string;
  description?: string | null;
  stateId?: string;
  priority?: Priority;
  estimate?: number | null;
  dueDate?: string | null;
  assigneeId?: string | null;
  parentId?: string | null;
  cycleId?: string | null;
  epicId?: string | null;
  milestoneId?: string | null;
  sortOrder?: number;
  labelIds?: string[];
  addLabelIds?: string[];
  removeLabelIds?: string[];
}

export type IssueField = keyof IssuePatch;

/** Everything an issue can be created with; only `title` is required. */
export interface CreateIssueInput
  extends Omit<IssuePatch, 'title' | 'addLabelIds' | 'removeLabelIds'> {
  title: string;
}

export const ISSUE_PATCH_FIELDS: IssueField[] = [
  'title',
  'description',
  'stateId',
  'priority',
  'estimate',
  'dueDate',
  'assigneeId',
  'parentId',
  'cycleId',
  'epicId',
  'milestoneId',
  'sortOrder',
  'labelIds',
  'addLabelIds',
  'removeLabelIds',
];

// ---------------------------------------------------------------------------
// Filters — implemented in issue-filtering.ts (B5); re-exported here so older
// imports keep working. The legacy names map onto the B5 ones.
// ---------------------------------------------------------------------------

export {
  EMPTY_FILTERS,
  ME,
  NONE,
  UNASSIGNED,
  filterIssues,
  filtersFromSearchParams,
  filtersToSearchParams,
  isFilterActive,
  matchesFilters,
  normalizeIssueFilters,
  filtersFromSearchParams as parseIssueFilters,
  filtersToSearchParams as serializeIssueFilters,
  isFilterActive as hasActiveFilters,
} from './issue-filtering';
export type { IssueFilterInput, IssueFilters } from './issue-filtering';

/** Session cookie remembering the last issues layout (list / board / …). */
export const VIEW_COOKIE = 'issues-view';
