# B12 — Real-time multiplayer updates

## Goal
See teammates' changes within ~5 s without websockets (Vercel Hobby, $0).

## UX
Invisible: lists, board, detail pane refresh themselves. Never while you type.

## Build
- `GET /api/projects/[id]/changes` → `{ token }`, `Cache-Control: no-store`. Session,
  then ONE SQL statement that checks membership and aggregates max(ticket.updated_at),
  count(ticket), max(activity.created_at), max(comment.updated_at) of the project's
  tickets, label/state counts + max(epic.updated_at); 404 for non-members.
- `LiveUpdates({projectId})` (project layout slot): polls every 5 s while
  `document.visibilityState === 'visible'` and online; immediate check on focus /
  visibility / online. First token is the baseline; a changed token schedules a
  debounced (400 ms) `router.refresh()`. If an input/textarea/select/contenteditable is
  focused, the refresh waits for `focusout`. Stops on 401/403/404; backs off to 30 s on
  network errors.

## Edge cases
Own changes also bump the token → one redundant refresh (cheap, and the server
already agrees with the optimistic state). Hidden tabs cost nothing.
