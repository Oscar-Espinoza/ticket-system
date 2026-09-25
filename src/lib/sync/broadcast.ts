// Cross-tab messages (client only). One cached BroadcastChannel per name: a
// channel object never receives its own posts, so sharing one instance for
// posting and listening means the sending tab doesn't hear itself.

const channels = new Map<string, BroadcastChannel | null>();

function channel(name: string): BroadcastChannel | null {
  if (!channels.has(name)) {
    let ch: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') ch = new BroadcastChannel(name);
    } catch {
      // Unsupported / blocked: tabs fall back to SSE / polling.
    }
    channels.set(name, ch);
  }
  return channels.get(name) ?? null;
}

function post(name: string, message: unknown) {
  try {
    channel(name)?.postMessage(message);
  } catch {
    // Channel closed or message not cloneable — other tabs catch up via SSE.
  }
}

function listen(name: string, fn: () => void): () => void {
  const ch = channel(name);
  if (!ch) return () => {};
  ch.addEventListener('message', fn);
  return () => ch.removeEventListener('message', fn);
}

const projectChannel = (projectId: string) => `ticket-sync:project:${projectId}`;
const OUTBOX_CHANNEL = 'ticket-sync:outbox';

/** Tell other tabs of this project that its data changed (they refresh). */
export function broadcastProjectChanged(projectId: string) {
  post(projectChannel(projectId), { type: 'changed' });
}

export function onProjectChanged(projectId: string, fn: () => void) {
  return listen(projectChannel(projectId), fn);
}

/** Tell other tabs the shared outbox changed (they reload their mirror). */
export function broadcastOutboxChanged() {
  post(OUTBOX_CHANNEL, { type: 'outbox' });
}

export function onOutboxChanged(fn: () => void) {
  return listen(OUTBOX_CHANNEL, fn);
}
