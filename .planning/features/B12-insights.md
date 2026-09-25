# B12 — Insights / analytics

## Goal
A quiet analytics page per project: flow, backlog shape and speed.

## UX (`/dashboard/projects/[id]/insights`)
- One filter row: date range presets (4 / 12 / 26 / 52 weeks, default 12) and label
  (Select, "All labels"); stored in the URL (`?range=12w&label=…`).
- Stat cards: open issues, created, completed, median cycle time, median lead time.
- Charts (hand-rolled SVG in `components/insights`, token colours, `<title>` per mark,
  hover/focus tooltip, sr-only table view):
  - Created vs completed per week (two-series line, legend + direct end labels).
  - Throughput: completed per week (columns + average rule).
  - Open issues by state / priority / assignee / label (horizontal bars; states use
    their own colours, others use the primary colour).
  - Cycle time + lead time distributions (buckets <1d, 1–3d, 3–7d, 1–2w, 2–4w, >4w).
- Empty state when the project has no issues.

## Data
`src/lib/insights.ts` `getProjectInsights(projectId, {weeks, labelId})` — caller has
already checked membership. One `db.batch` of SQL aggregates: weekly `date_trunc('week')`
counts for created/completed, open grouped by state/priority/assignee/label,
`percentile_cont(0.5)` medians and `count(*) filter` buckets for cycle
(`completed_at - started_at`) and lead (`completed_at - created_at`) time over issues
completed in the range. Deleted issues excluded; archived excluded from "open" only.
Label filter validated against the project's labels.

## Files
`src/lib/insights.ts`, `src/components/insights/*`,
`src/app/dashboard/projects/[id]/insights/page.tsx`.

## Edge cases
Weeks with zero data are filled in JS; no started_at (straight to done) → cycle time
skipped for that issue; label filter for a foreign label id → ignored.
