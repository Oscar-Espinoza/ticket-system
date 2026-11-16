// The one issue shape the list, board, detail and every other issue surface consume.
// Client-safe: no server imports here.

import { m } from '@/lib/i18n';
import { lazyLabels } from '@/lib/lazy-labels';
import type { Priority, StateType } from '@/lib/issue-enums';

// ---------------------------------------------------------------------------
// Workflow states
// ---------------------------------------------------------------------------

export { STATE_TYPE_ORDER, type StateType } from '@/lib/issue-enums';

export const STATE_TYPE_LABEL: Record<StateType, string> = lazyLabels({
  triage: m.common_state_type_triage,
  backlog: m.common_state_type_backlog,
  unstarted: m.common_state_type_unstarted,
  started: m.common_state_type_started,
  completed: m.common_state_type_completed,
  canceled: m.common_state_type_canceled,
});

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

export { PRIORITY_ORDER, type Priority } from '@/lib/issue-enums';

export const PRIORITY_LABEL: Record<Priority, string> = lazyLabels({
  none: m.common_priority_none,
  urgent: m.common_priority_urgent,
  high: m.common_priority_high,
  medium: m.common_priority_medium,
  low: m.common_priority_low,
});

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
  /** Planned start, YYYY-MM-DD (issue timeline view). */
  startDate: string | null;
  /** Calendar date, YYYY-MM-DD (no timezone). */
  dueDate: string | null;
  /** SLA deadline from the project's policy for this priority; null = no SLA. */
  slaDueAt: Date | null;
  slaBreachedAt: Date | null;
  /** When the issue entered its current state ("time in status"). */
  stateChangedAt: Date | null;
  assignee: IssueUser | null;
  /** Who the issue is waiting on (a project member); null = no one. */
  waitingOn: IssueUser | null;
  /** When to follow up: calendar date, YYYY-MM-DD (no timezone), like dueDate. */
  followUp: string | null;
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
  startDate?: string | null;
  dueDate?: string | null;
  assigneeId?: string | null;
  waitingOnId?: string | null;
  followUp?: string | null;
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

/** Session cookie remembering the last issues layout (list / board / …). */
export const VIEW_COOKIE = 'issues-view';

/** The issues layout remembered in the session cookie, for a load's `defaultView`. */
export function readDefaultView(cookies: { get(name: string): string | undefined }) {
  return cookies.get(VIEW_COOKIE);
}
