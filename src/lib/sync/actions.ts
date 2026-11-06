// Types of the server actions the outbox can queue. Client code imports only
// these; the runtime registry is src/lib/server/outbox-actions.ts.

import type { OUTBOX_ACTIONS } from '@/lib/server/outbox-actions';

export type OutboxActionName = keyof typeof OUTBOX_ACTIONS;
export type OutboxArgs<N extends OutboxActionName> = Parameters<(typeof OUTBOX_ACTIONS)[N]>[0];
export type OutboxResult<N extends OutboxActionName> = Awaited<ReturnType<(typeof OUTBOX_ACTIONS)[N]>>;
