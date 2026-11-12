// Daily sweep for GitHub / GitLab / Bitbucket deliveries whose processing
// failed or never finished after the 202 (lazy retries also run after every
// new delivery), then prune finished rows. Idempotent — due rows are claimed
// atomically, so a Vercel re-run or a concurrent lazy retry never runs a row twice.

import { pruneInbound, retryInbound } from '@/lib/vcs/inbound';

/** Bounded so one run stays inside the function time limit. */
const ROUNDS = 4;
const PER_ROUND = 25;

export async function run(now: Date): Promise<string> {
  let retried = 0;
  for (let round = 0; round < ROUNDS; round++) {
    const count = await retryInbound({ limit: PER_ROUND, now });
    retried += count;
    if (count < PER_ROUND) break;
  }
  const pruned = await pruneInbound(now);
  return `retried ${retried}, pruned ${pruned}`;
}
