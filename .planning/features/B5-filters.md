# B5 — Filters (priority / label / date / creator / …)

## Goal
Linear-style filtering over every issue property, URL-shareable and storable in saved views.

## UX
- Toolbar "Filter" button (hotkey `f`) opens a two-level popover: property list →
  values (search box + checkmarks, multi-select, stays open). Backspace on an empty
  search goes back to the property list.
- Properties: Status (states + "any <type>" entries), Assignee (Me, No assignee,
  members), Creator (Me, members), Priority, Labels (any-of, No label), Cycle (No cycle),
  Epic (No epic), Due date (Overdue, Today, This week, Next week, No due date),
  Created / Updated (last 1/7/30/90 days), Sub-issues (has sub-issues / is sub-issue).
- Active filters render as chips "Priority is Urgent, High ×"; clicking the chip
  reopens that property's value list; "Clear" removes everything.
- Quick text box (title / key substring), debounced into the URL param `q`.

## Data
- `src/lib/issue-filtering.ts`: `IssueFilters` (plain JSON), `EMPTY_FILTERS`,
  `filterIssues(issues, filters, {viewerId, allIssues?})`, `filtersFromSearchParams`,
  `filtersToSearchParams` (record, null = delete), `isFilterActive`,
  `normalizeIssueFilters(json)` (saved views), sentinels `ME`, `UNASSIGNED`, `NONE`.
- URL params (comma lists): `q state stateType assignee creator priority label cycle
  epic due created updated hierarchy`. `state` + single `assignee` stay compatible.
- `issue-model.ts` filter section re-exports these; legacy `{stateIds, assignee}`
  object literals are still accepted by `filterIssues` (tests, old callers).
- `IssueFiltersProvider` (inside `IssuesView`) holds state seeded from the URL, else
  `initialFilters` (saved view), mirrors every change to the URL (replaceState).
  `useIssueFilters()` / `useSetIssueFilters()` / module `setIssueFilters()`.

## Files
`src/lib/issue-filtering.ts` (new), `src/lib/issue-model.ts` (filter section),
`src/components/issues/issue-filters.tsx`, `src/components/views/filter-menu.tsx` (new).

## Edge cases
- Unknown ids in the URL (deleted label/member) are kept but match nothing; chips show "Unknown".
- "Me" resolves to the viewer at filter time, so saved views work for everyone.
- Date filters use the local calendar (weeks start Monday); overdue ignores closed issues.
- Status filter also hides non-matching state columns on the board.
