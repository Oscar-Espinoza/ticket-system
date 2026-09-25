# B12 — Offline support

## Goal
Read-only offline: previously visited pages still open; everything else shows a
friendly offline page. Queued writes are **out of scope** (server actions need the
network; the banner says so).

## Build
- `public/sw.js` (versioned caches):
  - install: precache `/offline`, icons; activate: drop old caches, `clients.claim()`.
  - GET same-origin only. Never touch `/api/*` (auth, export, polling), non-GET
    (server actions are POST), RSC fetches (`RSC` header / `_rsc`) — the router falls
    back to a full navigation when those fail, which the SW then serves.
  - `/_next/static/*`: cache-first (hashed, immutable). Icons/manifest: stale-while-revalidate.
  - Navigations: network-first, successful 200 HTML stored in a pages cache (capped at
    40); offline → cached page → `/offline`. `/login`, `/signup` and the
    `/api/auth/sign-out` POST are never cached and wipe the pages cache (signing out
    leaves no private pages behind).
- `src/app/offline/page.tsx`: static page, "You're offline", retry button.
- `src/components/pwa/offline-banner.tsx`: `useSyncExternalStore` on online/offline;
  fixed bottom-centre pill "You're offline — changes can't be saved until you reconnect."

## Edge cases
Server-side redirects are not cached (`response.redirected`); opaque/cross-origin
responses ignored; SW updates activate on next load (`skipWaiting` on install).
