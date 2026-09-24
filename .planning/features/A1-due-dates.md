# A1 — Due dates

## Goal
Optional due date per issue.

## UX
`DueDatePicker`: quick options (Today, Tomorrow, End of week, In 1 week, In 2
weeks) + calendar + Clear. Rows/cards show "Due Mar 4"; red when overdue and
the state isn't completed/canceled, amber when due today.

## Data
`ticket.due_date` (`date`, string `YYYY-MM-DD`). Validated as a real calendar
date. Helpers `formatDueDate`, `dueStatus` in `lib/dates.ts` (local-time,
no timezone shifting: dates are compared as strings).
