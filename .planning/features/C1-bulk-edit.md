# C1 — Bulk select + multi-edit

## Goal
Select many issues in the list / board / table and change them in one go (Linear's
multi-select + floating action bar).

## UX
- List rows: checkbox slot at the start of the row — visible on hover / focus, always
  once anything is selected. Click toggles; ⌘/Ctrl+click toggles; Shift+click adds the
  range from the anchor (last toggled) in visual (DOM) order. Plain click still opens.
- Board cards: ⌘/Ctrl+click toggles, Shift+click range; selected cards get a ring.
- Table: first column is a checkbox; the header checkbox selects / clears all rows
  (mixed state when partial). Row clicks follow the list rules.
- Keys: `x` toggles the focused row / card; ⌘A selects every visible issue while focus
  is inside the view (never in inputs); Esc clears (only with a selection and no open
  dialog / menu / drag); ⌘⌫ moves the selection to trash after a confirm.
- Selected rows: subtle `bg-primary/5`-style highlight + `aria-selected`.
- Bulk bar (bottom centre, ≥1 selected): "N selected ×", then Status, Priority,
  Assignee, Labels (tri-state: all / some / none; toggling adds to all or removes from
  all), Estimate (scale ≠ none), Due date (+ "Remove due date" when mixed), Cycle (if
  cycles exist), Epic (if epics exist), Archive, Move to trash (confirm). The pickers
  open upwards and show the common value (none checked when mixed). Tab reaches it.
- Guests: can select (Copy IDs / links in the context menu) but the bar only shows the
  count, clear and "Copy IDs".

## Data / actions
- `src/components/issues/selection.tsx`: tiny external store (`useSyncExternalStore`)
  so a toggle re-renders only the affected rows. `IssueSelectionProvider({issues})`
  prunes ids that left the visible set; hooks `useIssueSelection()` (store, no-op
  outside a provider), `useIsSelected(id)`, `useSelectedIds()`; `selectionClick(event,
  id)` for row/card/table click handlers; `SelectCheckbox`.
- Ranges and ⌘A read ids from the DOM (`[data-issue-row]`, `[data-board-card]` inside
  `[data-issue-view]`), so they follow grouping, collapsed groups and board columns.
- Edits: `mutations.bulkUpdate(selected, patch)` (one server call, one undo entry).
  Labels: one `{addLabelIds}` / `{removeLabelIds}` patch (C4). Archive / trash:
  `mutations.archiveMany` / `mutations.removeMany` (C4 — one call, one undo).

## Files
`selection.tsx` (new), `slots/bulk-bar.tsx`, `issues-view.tsx` (provider + scope),
`issue-list.tsx`, `issue-row.tsx`, `board/board.tsx`, `board/board-card.tsx`,
`views/table-view.tsx`.

## Edge cases
- Pending (optimistic) issues can't be selected for edits (mutations skip them).
- Filter change / deletion / archive prunes the selection.
- ⌘⌫ and Esc run in a capture listener so they win over the single-issue ⌘⌫ (B10)
  and the pane's Esc while a selection exists.
- Label grouping shows an issue in several places; ids are de-duplicated.
