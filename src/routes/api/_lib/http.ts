// Small helpers shared by the session-authenticated route handlers.
// (Not a route: files in src/routes without a `+` prefix are ignored.)

/** Headers for responses that must never be cached (live state, per-viewer data). */
export const NO_STORE = { 'Cache-Control': 'no-store' };

/** CSP for user-uploaded bytes served from our origin: no scripts, no navigation, images only. */
export const SANDBOX_CSP = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox";

/** Resolves after `ms`, or as soon as `signal` aborts (so a closed client never waits out a timer). */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done);
  });
}
