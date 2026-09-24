// Owner: B2 (notifications). Stub — called by emitIssueEvent after the
// response for every batch of stored events. Turn events into `notification`
// rows (assignee, subscribers, @mentions) and send emails via sendEmail.
// Must not throw for expected conditions; failures are logged by the caller.

import type { StoredIssueEvent } from '@/lib/events';

export async function dispatchNotifications(events: StoredIssueEvent[]): Promise<void> {
  void events;
}
