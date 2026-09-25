# B7 — Automations (auto-archive, auto-close, trash purge, cycle upkeep)

## Goal
`runProjectAutomations(projectId)` — run lazily from the project layout's
`after()`, at most once a day per project, never throws.

## Flow
1. Throttle: `UPDATE project SET automation_run_at = now() WHERE id = $1 AND
   (automation_run_at IS NULL OR automation_run_at < now() - interval '1 day')
   RETURNING …settings` — no row → return (another request already ran it).
2. **Auto-archive** (`autoArchiveMonths`): active issues in completed/canceled
   states whose `coalesce(completed_at, canceled_at, updated_at)` is older than
   N months → `archive(SYSTEM_ACTOR, …)`.
3. **Auto-close** (`autoCloseMonths`): active issues in triage/backlog/unstarted
   states with `updated_at` older than N months → `bulkUpdate` to the first
   canceled state (not "Duplicate"), then an `issue.auto_closed` event with
   `summary: "auto-closed after N months of inactivity"`.
4. **Trash purge**: `deleted_at` older than 30 days → `purge(SYSTEM_ACTOR, …)`.
5. **Cycles** (when enabled): auto-create upcoming cycles (if auto-create is on,
   fresh cadences aligned to `project.cycle_start_weekday`), complete ended
   cycles (`completedAt = endsAt`) and — when `project.cycle_auto_rollover` is
   on (default) — roll unfinished issues into the next cycle when one exists.
Each step is capped per run (100 archives / purges, 250 closes) and wrapped in
its own try/catch; leftovers are handled on the next day's run.

## UX — Settings → Automations (admin)
Two selects: "Auto-archive closed issues after" and "Auto-close stale issues
after": Off / 1 / 3 / 6 / 9 / 12 months, with short explanations. Read-only
notice for non-admins. Action `updateAutomationSettings` in
`src/app/actions/planning-settings.ts`.

## Edge cases
Throttle row returned but a step fails → logged; the day is still consumed (no
retry storm). No canceled state → auto-close skipped. All writes use
`actor { userId: null }` so activity shows "system".
