// Which workflow state a PR event moves issues to. Client-safe (the settings
// page shows the resolved defaults).
//
// Stored on the project: null = default (resolved here at run time, so it
// follows workflow edits), 'none' = automation off, otherwise a state id.

import type { WorkflowState } from '@/lib/issue-model';
import { firstStateOfType, isClosed, sortStates } from '@/lib/workflow';

export const AUTOMATION_OFF = 'none';

/** First started state named "In Review", else the last started state. */
export function defaultPrOpenState<T extends WorkflowState>(states: readonly T[]): T | undefined {
  const started = sortStates(states).filter((state) => state.type === 'started');
  return started.find((state) => state.name.trim().toLowerCase() === 'in review') ?? started.at(-1);
}

export function defaultPrMergeState<T extends WorkflowState>(states: readonly T[]): T | undefined {
  return firstStateOfType(states, 'completed');
}

/** The effective target state, or null when the automation is off. */
export function resolveAutomationState<T extends WorkflowState>(
  setting: string | null,
  states: readonly T[],
  fallback: (states: readonly T[]) => T | undefined,
): T | null {
  if (setting === AUTOMATION_OFF) return null;
  // A chosen state that was since deleted falls back to the default.
  return (setting && states.find((state) => state.id === setting)) || fallback(states) || null;
}

/**
 * Automations only move issues forward: never out of a closed state, never
 * back from a state that sorts at or after the target (In Review → In Progress).
 */
export function shouldAdvance(
  current: Pick<WorkflowState, 'id' | 'type'>,
  target: Pick<WorkflowState, 'id' | 'type'>,
  states: readonly WorkflowState[],
): boolean {
  if (current.id === target.id || isClosed(current.type)) return false;
  const order = sortStates(states).map((state) => state.id);
  return order.indexOf(current.id) < order.indexOf(target.id);
}
