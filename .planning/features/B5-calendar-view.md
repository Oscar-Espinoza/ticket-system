# B5 — Calendar view

## Goal
Month grid of issues by due date with drag-to-reschedule.

## UX
- Header: month name, prev / next / Today buttons (keys `[`/`]` not bound — buttons only).
- 6×7 grid (weeks start Monday), today highlighted, other-month days muted. Each day
  lists chips (state icon + key + title), max 4 then "+N more" (popover with the rest).
- Right sidebar "No due date" lists undated issues; drag a chip onto a day to set
  `dueDate`, drag a dated chip onto the sidebar to clear it.
- Click / Enter on a chip opens the issue. Guests can't drag.

## Data
dnd-kit `useDraggable` (chips) + `useDroppable` (days, sidebar); drop →
`mutations.update(issue, {dueDate})`. Month state local (starts on the current month).

## Files
`src/components/views/calendar-view.tsx` (new), `src/components/issues/views.tsx`.

## Edge cases
- Due dates are calendar strings — compared/placed with `toDateString`, no TZ shift.
- Issues due outside the visible month simply don't show (the sidebar only holds undated ones).
