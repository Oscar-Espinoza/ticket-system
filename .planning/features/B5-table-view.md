# B5 — Spreadsheet / table view

## Goal
A dense spreadsheet of the filtered issues with inline editing.

## UX
- Sticky header row; columns = visible properties (ID, Status, Title always, Priority,
  Assignee, Labels, Estimate, Due date, Cycle, Epic, Milestone, Sub-issues, Created,
  Updated). Horizontal scroll on narrow screens; title column grows.
- Sortable headers (Title, Priority, Due date, Created, Updated; ID → manual) set
  `display.orderBy` — the same ordering the Display menu shows.
- Cells use the popover pickers (state, priority, assignee, labels, estimate, due
  date); guests see read-only values.
- Row click / Enter opens the detail pane; j/k and ↑/↓ move between rows
  (rows carry `data-issue-row` so peek / issue shortcuts keep working).

## Data
Reads `IssueViewProps.issues` (flat, filtered, sorted); edits through
`mutations.update`. No grouping in the table.

## Files
`src/components/views/table-view.tsx` (new), `src/components/issues/views.tsx` (registry).

## Edge cases
- Pending issues are not editable (mutations ignore them) and not openable.
- Estimate column hidden when the project's scale is "none".
