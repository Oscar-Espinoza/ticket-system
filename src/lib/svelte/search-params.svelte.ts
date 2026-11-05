// Client-side URL state (filters, open pane, view tabs) without a server round trip.
//
// The React app wrote these with native history.replaceState: synchronous, no
// navigation, router data untouched, and Next kept useSearchParams() in sync.
// Here the write goes through SvelteKit's `replaceState` (shallow routing,
// caller 'replaceState'), which — unlike `goto(…, { shallow: true })` — fires
// no beforeNavigate/onNavigate/afterNavigate, never sets `navigating`, and
// does not take over the navigation/invalidation token, so an in-flight
// refreshAll() (the outbox refreshes after every write) still applies.
//
// That write is async inside Kit (it resolves the route first), and Kit only
// exposes it later as `page.shallow.url` — which a refreshAll() that was
// already loading can even put back to its old value. So this module keeps the
// URL it wrote in its own $state and treats that as the truth while the
// address bar shows it. Two setSearchParams() calls in one tick build on each
// other, as they did with the synchronous React write.
//
//   setSearchParams({ issue: 'APP-12', tab: null })   null/'' deletes a param
//   const searchParams = useSearchParams();            reactive, same methods as
//   const issueKey = $derived(searchParams.get('issue'));   URLSearchParams
//   currentUrl()                                       reactive URL
//
// Read params written this way through useSearchParams() / currentUrl(), not
// `page.url` (which keeps the last real navigation's URL).

import { replaceState } from '$app/navigation';
import { page, type ReadonlyURL, type ReadonlyURLSearchParams } from '$app/state';

/** The last URL setSearchParams() wrote (client only; never set during SSR). */
let written = $state.raw<URL | null>(null);
/** True from a setSearchParams() call until the history entry carries `written`. */
let writing = false;

/** The URL the address bar shows. Reactive (page navigations and setSearchParams). */
export function currentUrl(): ReadonlyURL {
  const kitUrl = page.shallow?.url ?? page.url;
  const ours = written;
  // Ours stays current until something else moves the address bar (a real
  // navigation, back/forward); every such move updates `page`, re-running this.
  if (ours && (writing || (typeof location !== 'undefined' && location.href === ours.href))) return ours;
  return kitUrl;
}

/** Push `written` into the history entry, one Kit call at a time, latest value wins. */
async function writeHistory() {
  try {
    // Bounded: each pass either catches up with `written` or a newer call replaced it.
    for (let pass = 0, target = written; pass < 8 && target && location.href !== target.href; pass++, target = written) {
      // Navigated to another page while a write was pending: drop it.
      if (location.pathname !== target.pathname) break;
      await replaceState(target, page.state);
    }
  } finally {
    writing = false;
  }
}

/**
 * Change search params in place (history replace, no navigation, no load
 * functions, focus and scroll untouched, page.state kept). Synchronous as far
 * as currentUrl()/useSearchParams() are concerned. Client only — call from
 * event handlers or effects.
 */
export function setSearchParams(changes: Record<string, string | null>) {
  const base = writing && written ? written : new URL(window.location.href);
  const params = new URLSearchParams(base.search);
  for (const [key, value] of Object.entries(changes)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const query = params.toString();
  // As the React code: the hash is dropped, an empty query leaves the bare path.
  const url = new URL(query ? `?${query}` : base.pathname, base.href);
  written = url;
  if (writing) return; // the running writeHistory() loop picks up the new value
  writing = true;
  void writeHistory();
}

/** Read-only, always-current URLSearchParams view (next/navigation useSearchParams()). */
export class LiveSearchParams {
  get #params(): ReadonlyURLSearchParams {
    return currentUrl().searchParams;
  }
  get(name: string): string | null {
    return this.#params.get(name);
  }
  getAll(name: string): string[] {
    return this.#params.getAll(name);
  }
  has(name: string, value?: string): boolean {
    return value === undefined ? this.#params.has(name) : this.#params.has(name, value);
  }
  get size(): number {
    return this.#params.size;
  }
  keys() {
    return this.#params.keys();
  }
  values() {
    return this.#params.values();
  }
  entries() {
    return this.#params.entries();
  }
  forEach(fn: (value: string, key: string) => void) {
    this.#params.forEach((value, key) => fn(value, key));
  }
  [Symbol.iterator]() {
    return this.#params[Symbol.iterator]();
  }
  toString(): string {
    return this.#params.toString();
  }
  /** A detached copy (for building new URLs). */
  snapshot(): URLSearchParams {
    return new URLSearchParams(this.#params.toString());
  }
}

const live = new LiveSearchParams();

/** useSearchParams(): reactive when its methods are called in markup, $derived or $effect. */
export function useSearchParams(): LiveSearchParams {
  return live;
}
