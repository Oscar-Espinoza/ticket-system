# B7 — Cycles (sprints) + planning settings

## Goal
Time-boxed cycles per project: planning settings, list page (current / upcoming /
past), manual create / edit / complete, cycle detail page with the cycle's
issues, and a Cycle property on issues.

## UX
- **Settings → Cycles & triage** (admin; others read-only notice): enable cycles,
  duration (1–8 weeks), start weekday, auto-create upcoming cycles (keeps the
  current + 2 upcoming scheduled), enable triage. Saving with auto-create on
  schedules cycles immediately (no waiting for the daily automation run).
- **Cycles list**: header with "New cycle"; Current (progress bar, scope /
  started / completed counts + points, days left), Upcoming, Past (completion %).
  Velocity chart above the past list (see B7-cycle-charts). Row → detail.
  Cycles off → EmptyState with "Enable in settings" (admins) link.
- **Cycle detail**: header (name, dates, status chip, Edit / Complete), progress
  stats, burndown, right sidebar with breakdown by assignee / label; body =
  `IssuesView` with the cycle's issues and `createDefaults={{ cycleId }}`.
- **Create / edit dialog**: name (optional, ≤ 80), description (≤ 500), start and
  end date (defaults: day after the last cycle, project duration). No overlaps.
- **Complete dialog**: completes now; unfinished issues → next upcoming cycle
  (default when one exists) or stay.
- **Property-cycle slot**: hidden when cycles are disabled (unless the issue
  already has a cycle); picker lists current, upcoming, then recent past, plus
  "No cycle". Uses `mutations.update(issue, { cycleId })`.

## Data / actions
- Dates are UTC day boundaries: `startsAt` 00:00Z of the first day, `endsAt`
  00:00Z of the day after the last (exclusive) — consecutive cycles share an edge.
- Status: completed (`completedAt`), current (starts ≤ now < ends), upcoming, past.
- Start weekday = `project.cycle_start_weekday` (0 = Sunday … 6, UTC; default
  Monday — C3, migration 0005). Changing it (or the duration) reschedules
  upcoming cycles that haven't started, consecutively from the current cycle's
  end (the current cycle's end moves to the next chosen weekday when needed).
  A fresh cadence (no open cycles) starts on the column's weekday.
- Auto-rollover = `project.cycle_auto_rollover` (default on; C3): the daily
  automation always completes ended cycles, but only moves their unfinished
  issues to the next cycle when it's on. Settings form: "Roll over unfinished
  issues" switch.
- `src/lib/cycles.ts` (server): `cycleStatus`, `ensureUpcomingCycles`,
  `rescheduleUpcomingCycles`, `completeCycle` (+ rollover via issue service),
  stats/history loaders. Pure date/name/status helpers live in
  `src/components/cycles/cycle-utils.ts` (client-safe). UI: `cycles-list`,
  `cycle-header`, `cycle-dialogs`, `cycle-stats`, `cycle-breakdown`,
  `cycle-picker`, `planning-settings-form`, `feature-off` in `src/components/cycles/`.
- Actions `src/app/actions/cycles.ts`: `createCycle`, `updateCycle`,
  `completeCycleAction` (write). `src/app/actions/planning-settings.ts`:
  `updatePlanningSettings`, `updateAutomationSettings` (admin).
- Rollover uses `bulkUpdate(actor, …, { cycleId })` → `issue.updated` activity.

## Edge cases
Overlapping dates → field error. Editing a completed cycle's dates is blocked.
Unique (project, number) race on auto-create → caught, logged. Cycle ids from
another project → not found. Disabling cycles keeps data; pages show the empty
state. (The start weekday / auto-rollover columns requested here landed in
migration 0005 — see C3-integration-fixes.md.)
