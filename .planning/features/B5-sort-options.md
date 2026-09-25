# B5 — Sort options (ordering)

## Goal
Order issues inside every group by manual, priority, created, updated, due date or title.

## UX
- Display menu "Ordering" select. Table column headers toggle the same ordering.
- Priority: urgent → low, "No priority" last; ties newest first. Created / updated:
  newest first. Due date: soonest first, no date last. Title: A–Z. Manual: `sortOrder`.

## Data
- `sortIssues(issues, orderBy)` in `src/lib/issue-grouping.ts` (stable, pure; applied
  before grouping so groups keep the order). `OrderBy` type lives there too and is
  re-exported by `display-options.tsx`.

## Files
`src/lib/issue-grouping.ts`, `src/components/issues/issues-view.tsx`,
`src/components/views/display-menu.tsx`, `src/components/views/table-view.tsx`.

## Edge cases
- Pending (optimistic) issues sort by their placeholder values; no special casing.
- Equal keys fall back to issue number so the order never jitters between renders.
