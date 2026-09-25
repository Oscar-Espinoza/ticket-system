# C1 — Issue context menu (right click)

## Goal
Right-click any list row, board card or table row for quick actions (Linear parity),
acting on the whole selection when the clicked issue is part of it.

## UX
- Menu header: "KEY" or "N issues".
- Submenus: Status, Priority, Assignee (you first), Labels (tri-state, stays open),
  Due date (Today, Tomorrow, End of week, In one week, In two weeks, Remove).
- Items: Copy ID, Copy link, Open in new tab (clicked issue only), Archive,
  Move to trash… (confirm dialog).
- Right-click elsewhere in the view keeps the native browser menu.
- Guests: only Copy ID / Copy link / Open in new tab.

## Data
- One `ContextMenu` for the whole view (not one per row): `onContextMenuCapture` on the
  `[data-issue-view]` wrapper finds the row / card; when none, propagation is stopped
  so Radix doesn't open and the native menu shows.
- Edits: `mutations.update` (single) / `mutations.bulkUpdate` (selection); labels use
  the same `toggleLabel` delta patch as the bulk bar; archive / trash use
  `archiveMany` / `removeMany`.
- Copy: `copyIssueId` / `copyIssueLink` from `productivity/issue-actions.ts` for one
  issue; joined keys / links for several.

## Files
`src/components/issues/issue-context-menu.tsx` (new; also exports the shared
`ConfirmTrashDialog` and label helpers used by the bulk bar), `issues-view.tsx`.

## Edge cases
- Right-clicking an unselected issue while others are selected targets only that issue
  (Linear does the same).
- Pending issues: edit items disabled.
