# B5 — Display options (visible properties)

## Goal
One "Display" popover (button + `shift+V`) that controls layout, grouping,
sub-grouping, ordering, empty groups, sub-issues and visible properties.

## UX
- Layout toggle (List / Board / Table / Calendar) at the top.
- Selects: Grouping, Sub-grouping (none + every kind except the grouping), Ordering.
- Switches: Show empty groups (list), Show sub-issues.
- Property toggle chips: ID, Status, Priority, Assignee, Labels, Estimate, Due date,
  Created, Updated, Cycle, Epic, Milestone, Sub-issues. "Reset" returns to defaults.
- Rows, cards and table columns all read `display.properties`.
- Show sub-issues off: issues whose parent is in the list are hidden, parents get a
  sub-issue count chip (done/total).

## Data
- `DisplayOptions` gains `layout`. `normalizeDisplayOptions(json)` fills gaps so saved
  / stored options from older versions stay valid.
- `DisplayOptionsProvider({initial?, persist?})`: the project layout's provider
  persists per project in localStorage (`issues-display:<projectId>`, try/catch,
  read through useSyncExternalStore so SSR renders defaults without a mismatch).
  `IssuesView` nests a non-persisted provider when given `initialDisplay` (saved views).
- Layout: `?view=` URL param wins, then the session cookie (non-saved views), then
  `display.layout`. Switching writes all three.

## Files
`src/components/issues/display-options.tsx`, `src/components/views/display-menu.tsx` (new),
`src/components/views/view-context.tsx` (new: sub-issue counts, saved view),
`issue-row.tsx`, `board-card.tsx`, `issues-view.tsx`.

## Edge cases
- localStorage unavailable / corrupted → defaults, no crash.
- Pull requests toggle is not shown (PR data isn't part of `IssueRow`).
