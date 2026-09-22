# M6 — Board: drag-and-drop kanban

Depends on: M5 (C5 rows/data + ticket update action), M4 (C4 icons), M3 (toasts).
Blocks: nothing (M7 is parallel-safe but ordered after for same-file discipline).

## Goal

Linear's kanban: five status columns, dense cards, optimistic drag — rendered from
the same C5 data the list uses.

## Scope

1. **Board component** (`components/board/`): five columns (fixed to
   `ticket_status` order), each with `StatusIcon` + name + count header and an
   add-issue affordance (reuses M5's create dialog).
2. **Cards**: mono key, title, `LabelChip`s, `Avatar` — composed from C4; hover
   ring, drag overlay with drop shadow (only shadow outside dialogs — C1).
3. **Drag-and-drop**: `@dnd-kit/react` + `@dnd-kit/helpers` `move()` (stack-decided
   pair). Optimistic status update via Phase 5 action; toast + rollback on failure.
   Keyboard drag fallback (Space to pick up, arrows, Space to drop) — required for
   the a11y bar M8 enforces.
4. **View switcher entry**: register the Board tab through M5's switcher registry;
   persist choice in URL params alongside M5's filters.

## Out of scope (owner in parentheses)

- Column customization/add columns (five statuses are schema-locked, D-07)
- Issue detail on card click (M7 — cards open detail via C5 row selection)
- Cross-project dragging, swimlanes, card editing inline
- New hotkeys outside the board surface (M7/M8 own the global set; board-local
  keys register via C3)

## Contracts

- Provides: none new (uses C5; board component is M7's list-pane sibling).
- Consumes: **C1**, **C3** (board-scoped hotkeys), **C4**, **C5**, Phase 5 actions.

## Allowed future touches (by later milestones)

- Card: M7 adds `onSelect` (additive).
- Switcher: additive registry entries only.

## Acceptance criteria

- [ ] `npm run lint` and `npm test` pass.
- [ ] Drag a card between columns: status persists after reload (server confirmed);
      failed update rolls back with a toast.
- [ ] Keyboard-only drag works end-to-end (documented in `?` overlay).
- [ ] List and Board render identical data for the same filter state.
- [ ] Switcher remembers List/Board across navigation within the session (URL
      param wins on shared links).

## Verification

Visual + interaction on the project route: mouse drag, keyboard drag, reload
persistence, both themes. Commands: `npm run lint`, `npm test`.
