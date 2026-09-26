// Workflow-state helpers shared by server and client. Keep DEFAULT_WORKFLOW_STATES
// in sync with src/db/migrations/0003_seed_workflow_states.sql.

import { STATE_TYPE_ORDER, type StateType, type WorkflowState } from '@/lib/issue-model';

export interface DefaultWorkflowState {
  name: string;
  type: StateType;
  color: string;
  position: number;
}

export const DEFAULT_WORKFLOW_STATES: readonly DefaultWorkflowState[] = [
  { name: 'Triage', type: 'triage', color: '#fc7840', position: -1 },
  { name: 'Backlog', type: 'backlog', color: '#9da1a8', position: 0 },
  { name: 'Todo', type: 'unstarted', color: '#747981', position: 1 },
  { name: 'In Progress', type: 'started', color: '#e5a100', position: 2 },
  { name: 'In Review', type: 'started', color: '#3b82f6', position: 3 },
  { name: 'Done', type: 'completed', color: '#5e6ad2', position: 4 },
  { name: 'Canceled', type: 'canceled', color: '#9da1a8', position: 5 },
  { name: 'Duplicate', type: 'canceled', color: '#9da1a8', position: 6 },
];

/** Type order first (triage → canceled), then position, then name. */
export function sortStates<T extends Pick<WorkflowState, 'type' | 'position' | 'name'>>(
  states: readonly T[],
): T[] {
  return [...states].sort(
    (a, b) =>
      STATE_TYPE_ORDER.indexOf(a.type) - STATE_TYPE_ORDER.indexOf(b.type) ||
      a.position - b.position ||
      a.name.localeCompare(b.name),
  );
}

/** Completed or canceled: the issue is resolved (no overdue warnings, not "open"). */
export function isClosed(type: StateType): boolean {
  return type === 'completed' || type === 'canceled';
}

export function firstStateOfType<T extends WorkflowState>(
  states: readonly T[],
  type: StateType,
): T | undefined {
  return sortStates(states).find((state) => state.type === type);
}

/** Where new issues land: first backlog state, else first unstarted one. */
export function defaultNewIssueState<T extends WorkflowState>(
  states: readonly T[],
): T | undefined {
  return firstStateOfType(states, 'backlog') ?? firstStateOfType(states, 'unstarted');
}

export interface StateTimestamps {
  startedAt: Date | null;
  completedAt: Date | null;
  canceledAt: Date | null;
}

/**
 * Lifecycle timestamps after moving from one state type to another. Only a
 * *type* change touches them (In Progress → In Review keeps startedAt). Used by
 * the server write path and by optimistic client updates, so both agree.
 */
export function stateTransitionTimestamps(
  from: StateType | null,
  to: StateType,
  current: StateTimestamps,
  now: Date = new Date(),
): StateTimestamps {
  // Copy only the timestamps: callers pass whole issue rows as `current`, and
  // returning it would spread every old field (incl. stateId) over the update.
  if (from === to) {
    return {
      startedAt: current.startedAt,
      completedAt: current.completedAt,
      canceledAt: current.canceledAt,
    };
  }
  switch (to) {
    case 'started':
      return { startedAt: current.startedAt ?? now, completedAt: null, canceledAt: null };
    case 'completed':
      return { startedAt: current.startedAt ?? now, completedAt: now, canceledAt: null };
    case 'canceled':
      return { startedAt: current.startedAt, completedAt: null, canceledAt: now };
    default:
      return { startedAt: null, completedAt: null, canceledAt: null };
  }
}
