# B5 — Sub-grouping / swimlanes

## Goal
A second grouping level: nested groups in the list, horizontal swimlanes on the board.

## UX
- Display menu "Sub-grouping" (No sub-grouping + every kind except the grouping).
- List: each group's issues are split into indented sub-headers (only non-empty ones
  unless "Show empty groups"). "+" on a sub-header creates with both patches.
- Board: one collapsible lane per sub-group (header with count), each lane shows the
  full set of columns; the column headers sit once at the top. Dropping into a cell
  applies the column's and the lane's patches.
- Table / calendar ignore grouping.

## Data
- `subGroupIssues(groups, subGroupBy, data)` → `IssueGroup & {subgroups}` using the
  same `groupIssues`; combined patches via `mergePatches(a, b)`.
- Board cells are droppables with ids `lane::column`.

## Files
`src/lib/issue-grouping.ts`, `src/components/issues/issue-list.tsx`, `src/components/board/board.tsx`.

## Edge cases
- Same kind for group and sub-group is disallowed (menu hides it; normalize drops it).
- Empty lanes are hidden on the board unless "Show empty groups".
- Label lanes + label columns can't happen (see above), so merged patches never both set labelIds.
