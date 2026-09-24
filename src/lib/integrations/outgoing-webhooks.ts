// Owner: B11 (integrations). Stub — called by emitIssueEvent after the
// response. Deliver events to the project's enabled `webhook` rows (signed
// with each webhook's secret; empty `events` = all types).

import type { StoredIssueEvent } from '@/lib/events';

export async function deliverWebhooks(events: StoredIssueEvent[]): Promise<void> {
  void events;
}
