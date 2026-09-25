# D3 — Server-sent live updates

## Goal
Teammates' changes show up in ~1.5 s instead of ~5 s, still $0 and without
websockets.

## Server
- `src/lib/sync/change-token.ts`: `getChangeToken(projectId, userId)` — B12's
  single-statement membership check + md5 of project aggregates, `null` for
  non-members. `changes` (polling) and `stream` routes both use it.
- `GET /api/projects/[id]/stream` (session + member, else 401/404 before any
  stream): `text/event-stream`, `no-store`, `X-Accel-Buffering: no`. Sends
  `retry:` + `event: token` immediately, re-checks every 1.5 s, emits `token`
  when it moves, `: ping` every 15 s, `event: gone` if membership is revoked,
  and `event: end` after ~50 s, then closes. Stops on client abort.
  `maxDuration = 60`.

## Client (`LiveUpdates`)
- `EventSource` while visible + online; closed when hidden / offline (pause).
- First token is the baseline (kept across reconnects, so a reconnect notices
  what changed meanwhile). `end` → reconnect after 250 ms; `error` → backoff
  1 s → 30 s; 3 failures without any message (or no `EventSource`) → B12's 5 s
  polling, which stops on 401/403/404. `gone` → stop.
- Same debounced (400 ms) refresh and "wait for focusout while typing" guard.
  Presence (`useProjectPresence`) untouched. Also mounts `SyncStatus` and the
  cross-tab `changed` listener.

## Trade-offs
- Vercel Hobby: no websockets; functions are capped (60 s here), so streams are
  short-lived and reconnect — each viewer holds ~1 invocation/50 s. Fluid
  compute bills active CPU, and the loop mostly sleeps.
- Each open, visible tab runs a tiny aggregate query every 1.5 s, which keeps
  the Neon free-tier compute awake while someone is looking (polling did too,
  at 5 s). Hidden tabs cost nothing.
- Own changes also move the token → one redundant refresh (cheap).
