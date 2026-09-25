// Server actions the outbox can queue, by name — queued calls are plain data
// (name + args) so they survive in IndexedDB and replay in any tab.

import {
  archiveIssue,
  archiveIssues,
  bulkUpdateIssues,
  createTicket,
  deleteTicket,
  deleteTickets,
  restoreIssue,
  restoreIssues,
  unarchiveIssue,
  unarchiveIssues,
  updateIssue,
} from '@/app/actions/tickets';

export const OUTBOX_ACTIONS = {
  createTicket,
  updateIssue,
  bulkUpdateIssues,
  archiveIssue,
  unarchiveIssue,
  deleteTicket,
  restoreIssue,
  archiveIssues,
  unarchiveIssues,
  deleteTickets,
  restoreIssues,
};

export type OutboxActionName = keyof typeof OUTBOX_ACTIONS;
export type OutboxArgs<N extends OutboxActionName> = Parameters<(typeof OUTBOX_ACTIONS)[N]>[0];
export type OutboxResult<N extends OutboxActionName> = Awaited<ReturnType<(typeof OUTBOX_ACTIONS)[N]>>;

export function runOutboxAction<N extends OutboxActionName>(
  name: N,
  args: OutboxArgs<N>,
): Promise<OutboxResult<N>> {
  const action = OUTBOX_ACTIONS[name] as (args: OutboxArgs<N>) => Promise<OutboxResult<N>>;
  return action(args);
}
