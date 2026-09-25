# B2 — Reminders / snooze

## Goal
"Remind me" on an issue, and snoozing inbox notifications, both built on
`notification.snoozedUntil` (hidden until due — evaluated lazily on read, no cron).

## Reminders (`header-remind.tsx`, issue detail header)
- Clock button; filled/accent when a reminder is pending (title shows when).
- Popover: In 3 hours · Tomorrow (9:00) · Next week (Mon 9:00) · custom date
  (calendar) + time input → "Set reminder". When one is pending: "Reminder set
  for <date>" with "Cancel reminder" (replacing is allowed).
- Creates a `reminder` notification for the current user with
  `snoozedUntil = when`, `data {key,title}`; it surfaces in the inbox (unread)
  at that time. One pending reminder per user and issue (setting replaces).

## Snooze (inbox)
Snooze options in the inbox detail toolbar / row menu: 1 hour, tomorrow 9:00,
next week, pick date. Sets `snoozedUntil` and clears `readAt` for the group.

## Actions (`src/app/actions/notifications.ts`)
`getIssueReminder({projectId, ticketId})`, `setIssueReminder({projectId,
ticketId, remindAt})`, `cancelIssueReminder({projectId, ticketId})` — each
authorizes `read` on the project and checks the ticket belongs to it.
`snoozeNotifications({ids, until})` — only the session user's rows.
Times: computed in the browser (local timezone), sent as ISO; the server
requires a future time within one year.

## Files
`src/components/issue-detail/slots/header-remind.tsx`,
`src/components/inbox/when-options.ts` (shared presets + formatting),
`src/components/inbox/when-picker.tsx` (presets + calendar [+ time]).

## Edge cases
Pending-state is fetched on mount/issue change; guests can set reminders (read
access). Reminders are not emailed (no scheduler on the free tier).
