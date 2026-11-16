// The workflow state types and priorities, with their fixed English names.
// Dependency-free (no i18n), so the MCP cards bundle (src/mcp-ui) can use it;
// the app's translated labels are STATE_TYPE_LABEL / PRIORITY_LABEL in
// issue-model.ts.

/** Linear's workflow state categories — mirrors the workflow_state_type DB enum. */
export type StateType = 'triage' | 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled';

export const STATE_TYPE_ORDER: StateType[] = ['triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled'];

/** Mirrors the issue_priority DB enum. */
export type Priority = 'none' | 'urgent' | 'high' | 'medium' | 'low';

/** Display / sort order: most urgent first, "No priority" last. */
export const PRIORITY_ORDER: Priority[] = ['urgent', 'high', 'medium', 'low', 'none'];

/** English names, for output that never follows the interface language (MCP cards). */
export const STATE_TYPE_LABEL_EN: Record<StateType, string> = {
  triage: 'Triage',
  backlog: 'Backlog',
  unstarted: 'Unstarted',
  started: 'Started',
  completed: 'Completed',
  canceled: 'Canceled',
};

export const PRIORITY_LABEL_EN: Record<Priority, string> = {
  none: 'No priority',
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};
