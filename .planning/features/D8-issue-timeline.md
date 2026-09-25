# D8 — Issue timeline view

## Goal
A Gantt layout for issues (Linear "timeline"): plan work by dragging bars.

## UX
- New layout `timeline` in the views registry (switcher + Display menu; grouping and
  ordering apply; empty groups hidden). Icon `GanttChart`.
- Left sticky column: state icon, key, title (click opens the pane; ⌘/Shift-click selects).
  Group header rows with count.
- Bar from `startDate` (else `createdAt`) to `dueDate`. No due date → dashed 3-day stub
  "no due date". Completed / canceled bars muted.
- Drag body = move (both dates, day snap), drag edges = resize (start ≤ due).
  Esc cancels; press without movement opens the issue. Keyboard on a bar: ←/→ move a day,
  Shift+←/→ change due date, Enter opens.
- Header: months + days (Week zoom) or week starts (Month zoom); today line + "Today" tag;
  zoom toggle Week / Month (localStorage), "Today" button scrolls to today.
- Read-only for guests / pending issues.

## Data
`mutations.update(issue, { startDate, dueDate })` (undo + optimistic via D3's hook).
Start-derived-from-createdAt only writes `startDate` when moved or its edge dragged.

## Also
- `PropertyStartDate` slot: "Start date" row with a picker (quick options + calendar,
  "Remove start date"); warns when start is after the due date.
- Display properties `startDate` (table column, row/card chip) and `sla` (D5's `SlaChip`
  in rows, cards, table).

## Files
`src/components/views/timeline-view.tsx`, `src/components/issues/{views,display-options}.tsx`,
`src/components/views/{display-menu,table-view,property-chips}.tsx`, `issue-row.tsx`,
`board-card.tsx`, `issue-detail/slots/property-start-date.tsx`.
