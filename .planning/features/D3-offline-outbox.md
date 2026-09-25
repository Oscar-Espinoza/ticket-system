# D3 — Offline edits outbox

## Goal
Issue edits made while offline (or during a network blip) are kept on screen,
stored on the device, and replayed in order when the connection returns.

## UX
- Edits behave exactly as online: optimistic UI, success toasts, Undo / ⌘Z.
- While ops are pending: a small pill bottom-centre — "N changes pending sync"
  (spinner, click = retry now) or "Offline · N changes pending sync" (sits just
  above B12's offline banner). Nothing when the outbox is empty.
- Replay: "Synced N offline changes"; an op the server rejects (validation /
  permission) is dropped with "Couldn't sync <label>: <reason>" and its
  optimistic change disappears.
- Offline create: the placeholder row stays (not editable until it has a real
  id); toast "Saved offline — the issue will be created when you reconnect".

## Data / actions (`src/lib/sync/`)
- `outbox.ts`: IndexedDB `ticket-sync` / store `outbox` (autoIncrement `seq` =
  FIFO order); every call try/catch, first failure switches to an in-memory
  array. Item = `{seq, userId, projectId, action, args, overlay, label, attempts}`.
  In-memory mirror + `useOutboxItems()` (useSyncExternalStore).
- `actions.ts`: name → server action registry (only the issue actions
  `useIssueMutations` uses), so queued calls are plain data.
- `perform(call)`: offline or already-pending ops for this user → enqueue (keeps
  order: last write wins on the server); otherwise call the action; a network
  failure (`TypeError` from fetch / `navigator.onLine === false`) → enqueue.
- Replay (`flush`) on start, `online`, focus, visible, after enqueue, and a
  backoff timer (5 s → 60 s) while items remain. Re-reads the store before every
  op; `{ok:false}` → drop + toast; other thrown errors retried 3× then dropped
  (e.g. a deploy renamed the action).
- `useIssueMutations` overlays the pending ops of its project on the server
  rows (`patch` / `set` archivedAt·deletedAt / `add` placeholder), so the
  change survives the transition settling, reloads and other tabs.
- Items carry the viewer's id; only the signed-in user's items replay/overlay.

## Undo
A queued op counts as done: its inverse is pushed immediately; undoing it goes
through `perform` again and queues behind it (FIFO keeps the order right).

## Edge cases
Server-side authorization/validation is unchanged — replay is just the same
server action later. Undo of an offline create is not offered (no id yet).
Private mode / IDB blocked → memory queue (lost on reload; still replays).
