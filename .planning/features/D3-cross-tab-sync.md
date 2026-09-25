# D3 — Cross-tab sync

## Goal
Two tabs on the same project never disagree for long, and never replay the same
offline op twice.

## Build (`src/lib/sync/broadcast.ts`)
- One cached `BroadcastChannel` per name (a channel object never receives its own
  posts, so posting and listening on the same instance skips the sender tab).
- `ticket-sync:project:<id>` — `{type:'changed'}` after a local mutation (or a
  replayed op) succeeds. `LiveUpdates` listens and schedules the same debounced,
  typing-guarded `router.refresh()` it uses for server changes.
- `ticket-sync:outbox` — posted after every outbox write; other tabs reload
  their mirror from IndexedDB, so pending pills and optimistic overlays match.
- Replay holds `navigator.locks.request('ticket-sync:outbox', {ifAvailable})`:
  one tab drains, others skip (their retry timer tries again later). The drainer
  re-reads the store before each op and deletes it after, so an op enqueued by
  another tab mid-drain is picked up, never duplicated.

## Edge cases
No BroadcastChannel → tabs rely on SSE / polling (a few seconds later). No Web
Locks → per-tab guard only (tiny double-replay window across tabs; ops are
idempotent-ish patches, and last write wins). In-memory fallback outboxes are
per tab, so no sharing and no duplication.
