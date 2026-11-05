// Fallback the service worker serves for navigations it has no cached copy of.
// Static (no session, no data) so it can be precached at install time
// (Next: `export const dynamic = 'force-static'`).
export const prerender = true;
