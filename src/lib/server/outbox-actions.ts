// Server actions the outbox can queue, by name — queued calls are plain data
// (name + args) so they survive in IndexedDB and replay in any tab. The client
// only sees the types (src/lib/sync/actions.ts).

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
} from '@/lib/server/actions/tickets';
import type { OutboxActionName, OutboxArgs, OutboxResult } from '@/lib/sync/actions';

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

export function runOutboxAction<N extends OutboxActionName>(
  name: N,
  args: OutboxArgs<N>,
): Promise<OutboxResult<N>> {
  const action = OUTBOX_ACTIONS[name] as (args: OutboxArgs<N>) => Promise<OutboxResult<N>>;
  return action(args);
}
