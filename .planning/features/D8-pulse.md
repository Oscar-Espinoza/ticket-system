# D8 — Pulse (weekly project update digest)

## Goal
A weekly "what happened" for every project member: epic updates, health changes,
issues created / completed — in the inbox and on a Pulse page.

## Behaviour (daily cron job `pulse`)
- Due per user: Monday (UTC) and no pulse in the last 6 days, or ≥ 7 days since the
  last pulse (catches missed Mondays). First pulse waits for a Monday. Idempotent: the
  last pulse is read from `notification` (type `pulse`), so a retried run skips.
- Window = last 7 days. Per project with activity (epic updates, created or completed
  issues, not deleted): counts + epic updates (epic name, health, previous health,
  author, excerpt).
- One `notification` per member of ≥1 active project, type `pulse`, projectId set when a
  single project, `data = {title: 'Weekly pulse', summary, lines[], projects[], from, to}`.
  Skips users with `notificationPrefs.pulse === false`. Then `deliverToChannels(rows)`.
- Batched inserts (500); never throws past the job.

## Pulse page (`/dashboard/dashboards?tab=pulse`)
Feed of epic updates across the viewer's projects (last 30 days, newest first: epic,
project, health badge, author, time, body excerpt) + a "This week" strip per project
(created / completed counts). Empty state explains epic updates.

## Files
`src/lib/pulse.ts` (compute + page reads), `src/lib/cron/jobs/pulse.ts`,
`src/components/dashboards/pulse-feed.tsx`.

## Integration
D11 renders `pulse` in the inbox (`describeNotification`, glyph, prefs toggle, detail
`data.lines`).
