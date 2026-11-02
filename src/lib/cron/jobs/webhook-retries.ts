// Daily sweep for outgoing webhooks (D10a): materialize events whose dispatcher
// never ran (activity.webhook_pending), resend every due delivery (lazy
// retries also run after new deliveries and on the integrations page), then
// prune the delivery log. Idempotent — due rows are claimed atomically, so a
// Vercel re-run or a concurrent lazy retry never double-sends.

import {
  pruneDeliveries,
  retryDueDeliveries,
  sweepPendingEvents,
} from '@/lib/integrations/outgoing-webhooks';

/** Bounded so one run stays inside the function time limit. */
const ROUNDS = 4;
const PER_ROUND = 50;

export async function run(now: Date): Promise<string> {
  let swept = 0;
  for (let round = 0; round < ROUNDS; round++) {
    const count = await sweepPendingEvents({ limit: PER_ROUND * 4, now });
    swept += count;
    if (count < PER_ROUND * 4) break;
  }
  let retried = 0;
  for (let round = 0; round < ROUNDS; round++) {
    const count = await retryDueDeliveries({ limit: PER_ROUND });
    retried += count;
    if (count < PER_ROUND) break;
  }
  const pruned = await pruneDeliveries(now);
  return `swept ${swept}, retried ${retried}, pruned ${pruned}`;
}
