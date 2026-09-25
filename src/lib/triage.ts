// Triage state resolution, shared by the triage UI and its server actions
// (client-safe: pure functions over a project's workflow states).

import type { WorkflowState } from '@/lib/issue-model';
import { firstStateOfType, sortStates } from '@/lib/workflow';

/** States an accepted issue may move to (open, non-triage). */
export function acceptStates<T extends WorkflowState>(states: readonly T[]): T[] {
  return sortStates(states).filter(
    (s) => s.type === 'backlog' || s.type === 'unstarted' || s.type === 'started',
  );
}

/** Default accept target: first backlog state, else first unstarted one. */
export function defaultAcceptState<T extends WorkflowState>(states: readonly T[]): T | undefined {
  return firstStateOfType(states, 'backlog') ?? firstStateOfType(states, 'unstarted');
}

function canceledStates<T extends WorkflowState>(states: readonly T[]): T[] {
  return sortStates(states).filter((s) => s.type === 'canceled');
}

const isDuplicateName = (s: WorkflowState) => s.name.trim().toLowerCase() === 'duplicate';

/** Where declined (and auto-closed) issues go: a canceled state that isn't "Duplicate". */
export function declineState<T extends WorkflowState>(states: readonly T[]): T | undefined {
  const canceled = canceledStates(states);
  return (
    canceled.find((s) => s.name.trim().toLowerCase() === 'canceled') ??
    canceled.find((s) => !isDuplicateName(s)) ??
    canceled[0]
  );
}

/** Where duplicates go: the "Duplicate" canceled state, else any canceled one. */
export function duplicateState<T extends WorkflowState>(states: readonly T[]): T | undefined {
  const canceled = canceledStates(states);
  return canceled.find(isDuplicateName) ?? canceled[0];
}

export const TRIAGE_REASON_MAX = 500;
