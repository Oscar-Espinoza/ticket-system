# B10 — Undo

## Goal
Every issue mutation made through `useIssueMutations` is reversible.

## Design (`src/lib/undo.ts`, client)
- Session stack (max 20) of `{id, label, run}`; `pushUndo`, `undoLast`, `runUndo(id)`
  (toast buttons remove their own entry so ⌘Z never undoes twice).
- `retainUndoHotkey()` — ref-counted registration of ⌘Z (not in text fields, not
  while a dialog is open) so any page using the hook gets it exactly once.

## Inverses (in `useIssueMutations`)
- `update(issue, patch)` → patch of the previous values of the touched fields
  (assignee → id, labels → ids), applied to the post-update issue.
- `bulkUpdate` → per-issue inverses grouped by identical patch → `bulkUpdate` each.
- `create` → move the created issue to trash; `archive` / `remove` → restore;
  `restore` → archive or trash again depending on where it came from.
- Undo runs through the same mutation functions with recording off (optimistic
  UI, activity events, notifications all still fire).

## UX
Success toasts (create, archive, trash, bulk of 2+) get "Undo"; restore stays silent (callers toast) but is still on the ⌘Z stack. Single property
edits stay silent; ⌘Z shows "Undid: <label>". Empty stack → "Nothing to undo".

## Files
`src/lib/undo.ts`, `src/components/issues/use-issue-mutations.ts` (API unchanged).
