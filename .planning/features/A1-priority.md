# A1 — Priority

## Goal
Linear priorities: No priority · Urgent · High · Medium · Low.

## UX
Priority glyph leads list rows / board cards (hidden for "none" on cards).
`PriorityPicker` with 0–4 number keys (0 none, 1 urgent … 4 low) and type to
filter. In detail properties and new-issue chips.

## Data
`ticket.priority` enum. `Priority`, `PRIORITY_ORDER` (urgent → none),
`PRIORITY_LABEL`, `isPriority` in `issue-model.ts`. Validated server-side.

## Files
`issue-model.ts`, `ui-icons/priority-icon.tsx` (imports the type),
`issue-pickers/priority-picker.tsx`.
