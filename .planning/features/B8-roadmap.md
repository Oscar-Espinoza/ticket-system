# B8 — Roadmap / timeline

## Goal
A Gantt view of the project's epics: see and reschedule work on a calendar.

## UX (`/projects/[id]/roadmap`)
- Left column (sticky): epic glyph + name + status; right: scrollable timeline.
- Zoom toggle: Weeks · Months · Quarters (px per day 28 / 8 / 3); header shows
  months (and week starts at Weeks/Months zoom); today line; scrolls to today on load.
- Bars span start → target date in the epic colour with a progress fill.
  Drag the bar to move, drag either edge to resize; snaps to weeks (Mondays for
  start, Sundays for target). Tooltip while dragging shows the dates. One-sided
  dates render a dashed 2-week stub. Milestones = diamonds at their target date.
- Keyboard: bars are focusable; ←/→ move a week, Shift+←/→ change the target,
  Enter opens the epic. Click (no drag) opens the epic.
- Epics without dates: side section "No dates" listing them (click opens).
- Read-only for guests; archived epics excluded; completed/canceled shown muted.

## Data
- `getProjectEpics` (server) gives epics + milestones + progress.
- Date changes call `updateEpic({projectId, id, startDate, targetDate})` optimistically,
  rolled back + toast on failure.
- The `Timeline` component is data-agnostic (items, `hrefFor`, optional `onChange`)
  so the initiative page reuses it read-only / cross-project.

## Files
`src/components/roadmap/timeline.tsx`, `roadmap-view.tsx`,
`src/app/dashboard/projects/[id]/roadmap/page.tsx`.

## Edge cases
- Range = min(start, today − 1 month) … max(target, today + 3 months), padded to months.
- Resizing past the other edge clamps to one week.
- Pointer capture so drags survive leaving the bar; Esc cancels a drag.
