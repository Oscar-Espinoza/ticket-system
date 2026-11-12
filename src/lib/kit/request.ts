// Request-scoped helpers for server code (src/lib, src/lib/server/actions),
// built on SvelteKit's getRequestEvent(): headers(), after(), cache(),
// redirect().

import { redirect as kitRedirect } from '@sveltejs/kit';
import { waitUntil as vercelWaitUntil } from '@vercel/functions';
import { getRequestEvent } from '$app/server';

/** The current request's headers. */
export async function headers(): Promise<Headers> {
  return getRequestEvent().request.headers;
}

/** after() tasks not finished yet. */
const inFlight = new Set<Promise<unknown>>();

/**
 * after(task): run work after the response. Vercel functions keep it alive
 * through @vercel/functions' waitUntil; on Node (adapter-node) the process
 * stays up, so the promise simply runs on. Errors are logged, never thrown at
 * the caller.
 */
export function after(task: Promise<unknown> | (() => unknown)): void {
  const run = typeof task === 'function' ? Promise.resolve().then(task) : task;
  const guarded = Promise.resolve(run)
    .catch((err) => console.error('[after] task failed', err))
    .finally(() => inFlight.delete(guarded));
  inFlight.add(guarded);
  // adapter-vercel passes no platform context, so register with Vercel's own
  // request context; outside Vercel this is a no-op and Node simply runs the
  // promise on.
  try {
    vercelWaitUntil(guarded);
  } catch {
    // not inside a Vercel request (adapter-node, cron, boot)
  }
}

/**
 * Resolves once every after() task started so far (and any they start) has
 * finished. For tests that assert what after-response work did.
 */
export async function afterSettled(): Promise<void> {
  while (inFlight.size > 0) await Promise.all([...inFlight]);
}

export function redirect(location: string): never {
  kitRedirect(303, location);
}

/**
 * cache(fn): memoize per request. Keyed on the request event, so a
 * layout load, page load and remote calls in one request share one result;
 * outside a request it simply calls fn.
 */
export function cache<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const perRequest = new WeakMap<object, Map<string, R>>();
  return (...args: A) => {
    let event: object;
    try {
      event = getRequestEvent();
    } catch {
      return fn(...args);
    }
    let memo = perRequest.get(event);
    if (!memo) perRequest.set(event, (memo = new Map()));
    const key = JSON.stringify(args);
    if (!memo.has(key)) memo.set(key, fn(...args));
    return memo.get(key)!;
  };
}
