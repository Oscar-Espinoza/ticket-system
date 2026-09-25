# B6 — Peek preview

## Goal
Linear's Space-to-peek: glance at an issue from the list without leaving it.

## UX
- List view, issue row focused → **Space** opens a read-only dialog: key,
  title, state, priority, assignee, labels, due date, description (B1's
  `Markdown` if present, else plain pre-wrapped text).
- Space or Esc closes; Enter opens the full issue (IssuesView's `onOpen` →
  detail pane); an "Open" link goes to the permalink page.
- Focus returns to the row on close (Radix restores focus to the trigger-less
  previously focused element — we refocus the row explicitly).

## Wiring
- `ListOverlay({ issues, onOpen })` slot registers a hotkey via
  `registerHotkeys` — key `' '`, scope "Issues", description "Peek issue",
  `when: event.target.closest('[data-issue-row]')` so board cards keep their
  Space pick-up (dnd-kit) and nothing fires elsewhere.
- The row id comes from `data-issue-row`; issue looked up in `issues`.
- Inside the dialog the registry is paused (open layer), so the dialog's
  own onKeyDown handles Space / Enter.

## Files
`src/components/issues/slots/list-overlay.tsx`,
`src/components/navigation/issue-peek.tsx`.

## Edge cases
- Row not in `issues` (filtered out meanwhile) → nothing opens.
- Issue changes while peeking → dialog reads the latest from `issues` by id;
  if it disappears the dialog closes.
