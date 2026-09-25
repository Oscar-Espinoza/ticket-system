# D5 — Time in status

## Goal
Show how long an issue has sat in its current state, and on hover how long it
spent in every state.

## UX
- In `PropertySla` a second row "In status": "In Progress · 3d" from
  `issue.stateChangedAt` (falls back to `createdAt` when never moved). Ticks
  every minute.
- Hover / focus opens a HoverCard: one line per state (icon, name, total time,
  bar proportional to the longest), current state marked "now". Loaded lazily
  on first open; skeleton while loading.

## Data / actions
- `getTimeInStatus({ projectId, issueId })` in `src/app/actions/sla.ts` (read
  level; ticket looked up by (projectId, id)). Reads the ticket + its
  `issue.updated` activity whose `data.changes` contain a `stateId` change (jsonb
  containment), oldest first. Segments: [createdAt → first change] in the first
  change's `from` state, then each change's `to` until the next change / now.
  Totals per state id, ordered by first entry.
- Pure fold `timeInStatus(createdAt, changes, current, now)` in `src/lib/sla.ts`.

## Edge cases
No state history → one segment (current state since creation). Deleted
states render from the stored name/type. History capped at 500 changes.
