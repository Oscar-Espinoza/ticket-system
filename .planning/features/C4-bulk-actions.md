# C4 — Label deltas + batched archive / trash

## Goal
Bulk label toggles and bulk archive / trash become ONE server call and ONE undo
entry (C1 grouped issues by resulting label set and looped per issue).

## Label deltas
- `IssuePatch.addLabelIds` / `removeLabelIds`: add / remove these labels, keep the
  rest. Can't be combined with `labelIds` (full set) in one patch, and one id can't be
  in both. Not accepted on create (`CreateIssueInput` omits them; the service rejects).
- Service (`normalizePatch` → `loadContext` → `resolvePatch` → `applyToIssue`):
  every id must be a project label; per issue the next set = kept + added (skip
  issues where nothing changes); `LABELS_MAX` checked on the result. The
  `issue.updated` change stays `{field: 'labelIds', from, to, added, removed}`.
  DB: one delete (`ticketId in changed, labelId in removed`) + one insert
  (`onConflictDoNothing`) in the same batch.
- Public API PATCH passes the body to the service, so it accepts them too
  (`docs/API.md`).
- Client: `applyIssuePatch` derives the set, `patchChangesIssue` understands the
  deltas, `inversePatch` swaps add ↔ remove limited to labels that actually
  changed on that issue; `bulkUpdate`'s undo already groups per-issue inverses into
  one entry.
- Bulk bar + context menu: `toggleLabel` = one `{addLabelIds: [id]}` or
  `{removeLabelIds: [id]}` patch for all targets.

## Batched lifecycle
- Service: `changeLifecycle` takes many ids (all-or-nothing, one query + one
  batch); `archiveMany` / `unarchiveMany` / `softDeleteMany` / `restoreMany`; the
  single-id exports wrap them.
- Actions: `archiveIssues`, `unarchiveIssues`, `deleteTickets`, `restoreIssues`
  (`{projectId, ids}` → `{ok, tickets}`), one authorization each.
- `useIssueMutations`: `archiveMany(issues, onDone?)` / `removeMany(issues,
  onDone?)` — one optimistic op, one server call, one undo entry (unarchive /
  restore all in one call), toast "Archived N issues" / "Moved N issues to trash".
  One issue delegates to `archive` / `remove` (unchanged wording).
- Bulk bar + context menu use them.
