# D5 — Recurring issues

## Goal
Per-project schedules (`recurring_issue`) that create an issue on a cadence:
daily / weekly on chosen weekdays / monthly on day N, every N units.

## UX
- **Settings → Recurring issues** (members and up edit; guests read-only):
  list of schedules — title, cadence summary ("Every 2 weeks on Mon, Thu"),
  next run ("Next Oct 6" / "Paused"), default-property glyphs, ⋯ menu (Edit,
  Run now, Pause / Resume, Delete with confirm). EmptyState with "New
  recurring issue".
- **Editor dialog**: title, description, repeat (Daily / Weekly / Monthly),
  every N, weekday toggles (weekly), day of month 1–31 (monthly; short months
  clamp to their last day), starts on (date, UTC), default properties via
  `PropertyChips` (status, priority, assignee, labels, estimate), "Due in N
  days" (blank = no due date). Live preview of the next 5 runs.
- **Run now** creates one issue immediately (schedule untouched), toast with a
  link to it.

## Data / actions
- `schedule` jsonb: `{ freq, interval, weekdays?, dayOfMonth?, start: 'YYYY-MM-DD' }`.
  `data` jsonb: `{ stateId, priority, assigneeId, labelIds, estimate, dueInDays }`.
  `nextRunAt` = 00:00Z of the next occurrence day.
- Client-safe schedule math `src/components/recurring/schedule.ts`:
  `normalizeSchedule`, `nextOccurrence(schedule, fromDay)`, `upcomingRuns`,
  `describeSchedule`.
- Server `src/lib/recurring.ts`: `runDueRecurringIssues(now, projectId?)`,
  `createFromSchedule(row, day)`. Each due row is **claimed** with a
  conditional update (`where next_run_at = <old>`) before creating, so
  concurrent / retried runs create at most one issue per occurrence. Missed
  occurrences collapse: one issue, then `nextRunAt` = first occurrence after
  today. Failed creation restores `nextRunAt` (retry next run). Actor = the
  schedule's creator while still a project member, else `SYSTEM_ACTOR`. Stale
  default ids are dropped via `sanitizeIssueDefaults` before `createIssue`.
- Actions `src/app/actions/recurring.ts` (write level): `createRecurringIssue`,
  `updateRecurringIssue`, `setRecurringIssueEnabled`, `deleteRecurringIssue`,
  `runRecurringIssueNow`. Every id is scoped by projectId.
- Cron `src/lib/cron/jobs/recurring.ts` → `runDueRecurringIssues(now)`; the
  settings page runs the project's due schedules lazily before rendering.

## Edge cases
Weekly with no weekdays → error. Resume recomputes from today (no backlog).
Editing the cadence recomputes `nextRunAt` from max(start, today). Max 50
schedules per project. Interval 1–30 (daily), 1–12 (weekly / monthly).
