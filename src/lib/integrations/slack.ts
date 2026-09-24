// Owner: B11 (integrations). Stub — called by emitIssueEvent after the
// response. Post selected events to the project's `slackWebhookUrl`.

import type { StoredIssueEvent } from '@/lib/events';

export async function postToSlack(events: StoredIssueEvent[]): Promise<void> {
  void events;
}
