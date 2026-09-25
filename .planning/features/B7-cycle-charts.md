# B7 — Cycle burndown + velocity charts

## Goal
Burndown on the cycle page, velocity on the cycles list — small hand-rolled SVG
primitives in `src/components/charts` (no chart library).

## UX
- **Burndown**: x = each day of the cycle, y = remaining scope. Series: Remaining
  (primary, filled area, only up to today), Scope (thin neutral line), Ideal
  (dashed neutral line from total scope at start to 0 at end). Toggle Issues /
  Points when estimates are on. Crosshair + tooltip on hover/focus (arrow keys
  move between days), legend, visually-hidden data table.
- **Velocity**: bars = completed points (or issues) per past cycle (last 8),
  dashed horizontal line = average of the last 3; tooltip per bar; legend.
- Empty cycles / no past cycles → short muted message instead of a chart.

## Data
`loadCycleHistory(projectId, cycleIds)` in `src/lib/cycles.ts`: one batch —
issue.updated activity rows whose `data.changes` contain a `cycleId` change
touching those cycles (jsonb containment) + every ticket currently in or ever
moved through them. Per issue, membership intervals are rebuilt from those
changes (no change row before the first → member since `createdAt`).
- Scope(day) = members at end of day, minus issues canceled by then.
- Completed(day) = members with `completedAt` ≤ end of day. Remaining = scope − completed.
- Past cycle totals are evaluated at `min(endsAt, completedAt)` so rolled-over
  issues still count against the cycle they missed. Points = sum of estimates
  (unestimated = 0); counts always available.

## Files
`src/components/charts/{line-chart,bar-chart,chart-frame}.tsx`,
`src/components/cycles/cycle-charts.tsx` (BurndownChart, VelocityChart, UnitToggle),
`src/lib/cycles.ts` (`loadCycleHistory`, `cycleTotals`, `cycleBurndown`).

## Edge cases
Deleted issues ignored; archived still count. Days beyond today not plotted for
Remaining. Zero scope → flat chart with y max 1. Activity history capped to the
most recent 5 000 cycle changes per project.
