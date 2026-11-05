import { refreshAll } from '$app/navigation';
import { page } from '$app/state';

// Refresh the open route after a write, the way Next applied an action's
// revalidatePath. Used by the generated action wrappers (src/lib/actions/*)
// and the outbox (outbox.svelte.ts).
//
// A refreshAll() that starts while another is loading makes Kit throw the
// first one's result away (its promise still resolves). So writes don't call
// it directly: each asks for a refresh and waits until one that *started after
// the write* has actually been applied (page.data replaced). Requests made
// while a refresh is loading share the next one. This is what lets the
// optimistic layer in use-issue-mutations drop its ops once the call settles.
let refreshRequested = 0;
let refreshing = false;
const refreshWaiters: Array<{ seq: number; resolve: () => void }> = [];

export function refreshAfterWrite(): Promise<void> {
  const seq = ++refreshRequested;
  const done = new Promise<void>((resolve) => refreshWaiters.push({ seq, resolve }));
  if (!refreshing) {
    refreshing = true;
    void runRefreshes();
  }
  return done;
}

async function runRefreshes() {
  let covered = 0;
  let retries = 0;
  try {
    while (covered < refreshRequested) {
      const target = refreshRequested;
      const before = page.data;
      try {
        await refreshAll();
      } catch {
        // A failed reload doesn't undo the write; the next navigation / SSE catches up.
      }
      // Unchanged data = superseded by someone else's refreshAll that is still
      // loading; run one of our own so the waiters see fresh data (bounded).
      if (page.data === before && retries < 2) {
        retries += 1;
        continue;
      }
      retries = 0;
      covered = target;
      for (let i = refreshWaiters.length - 1; i >= 0; i--) {
        if (refreshWaiters[i].seq <= covered) refreshWaiters.splice(i, 1)[0].resolve();
      }
    }
  } finally {
    refreshing = false;
    for (const waiter of refreshWaiters.splice(0)) waiter.resolve();
  }
}
