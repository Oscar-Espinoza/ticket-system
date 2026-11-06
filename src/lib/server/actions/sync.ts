// Entry point for every outbox call (direct or replayed). The queue owner —
// the user who made the change — travels with the call and must match the
// session the request carries: a stale tab whose account was switched in
// another tab must not apply (or lose) one user's queued changes as another.

import { OUTBOX_ACTIONS, runOutboxAction } from '@/lib/server/outbox-actions';
import { sessionUserId } from '@/lib/session';
import type { OutboxActionName, OutboxArgs, OutboxResult } from '@/lib/sync/actions';

/** The session doesn't belong to the queue owner: keep the op queued, don't run it. */
export type OutboxSuspended = { ok: false; suspended: true; error: string };

const isOutboxAction = (name: unknown): name is OutboxActionName =>
  typeof name === 'string' && Object.hasOwn(OUTBOX_ACTIONS, name);

export async function runOutboxCall<N extends OutboxActionName>(call: {
  queueOwner: string;
  action: N;
  args: OutboxArgs<N>;
}): Promise<OutboxResult<N> | OutboxSuspended> {
  if (!call || !isOutboxAction(call.action)) {
    return { ok: false, suspended: true, error: 'Unknown change type.' };
  }
  const userId = await sessionUserId();
  if (!userId) return { ok: false, suspended: true, error: 'Signed out.' };
  if (typeof call.queueOwner !== 'string' || call.queueOwner !== userId) {
    return { ok: false, suspended: true, error: 'Signed in as a different account.' };
  }
  return runOutboxAction(call.action, call.args);
}
