# M7 — Issue detail pane

Depends on: M5 (C5 + row selection), M6 (board cards as second entry point).
Blocks: M8 (final audit includes the detail surface).

## Goal

Linear's split view: list/board stays on the left, a detail pane opens on the
right with editable properties — no full-page navigation on desktop.

## Scope

1. **Split layout** on the project route: content area becomes list/board pane +
   detail pane (`320px+` resizable or fixed per C1 breakpoints). Mobile falls back
   to a full-screen sheet (shadcn `sheet`) — one component, two presentations.
2. **Detail pane content**:
   - Editable title (inline, Enter/blur to save via Phase 5 update action);
   - description editor (plain textarea at C1 type scale — no rich text);
   - properties editor (status, assignee — priority/labels omitted, README amendment 1): Radix selects built
     on C4 (`StatusIcon` inside the status select trigger);
   - key + created/updated metadata, GitHub state line **only if** Phase 7/8 data
     exists (D-21: otherwise omit the row entirely).
3. **Activity substitute**: status-change history is rendered only if Phase 5
   exposes it; otherwise the pane shows no timeline section (no fake entries).
   Comments/activity require a schema migration and are explicitly OUT — recorded
   in README as a future M9, not part of this plan.
4. **Selection wiring**: `Enter` (M5's deferred binding) and card click (M6)
   open the pane via the additive `onSelect` props granted in M5/M6; `Esc`
   closes it and returns focus to the invoking row/card (focus restoration is part of
   the contract, verified in M8).
5. **Hotkeys** (C3): `Enter` open, `Esc` close, `S` status menu — registered
   scoped to a row being focused.

## Out of scope (owner in parentheses)

- Comments, reactions, rich text, attachments (schema migration — future M9)
- Webhook/GitHub mutation UI (GSD Phase 7/8 owns behavior; M7 only displays)
- Changing list/board layouts to make room (pane is additive; C2 content area
  already reserves it)

## Contracts

- Provides: none new (extends C5 additively via `onSelect`, already granted).
- Consumes: **C1**, **C2**, **C3**, **C4**, **C5**, Phase 5 actions.

## Allowed future touches (by later milestones)

- M8 may adjust pane width/focus styling (values, not structure).

## Acceptance criteria

- [ ] `npm run lint` and `npm test` pass.
- [ ] Opening/closing the pane never triggers a full page load; deep-linkable URL
      (issue key in search param) restores the open pane.
- [ ] Every property edit persists after reload; failures toast + revert.
- [ ] Keyboard: `Enter` opens focused row, `Esc` closes and focus returns to the
      row/card that opened it.
- [ ] No comments UI, no placeholder timeline, no disabled rich-text controls.
- [ ] Narrow viewport: sheet presentation, no horizontal overflow.

## Verification

Visual + keyboard on list and board entries, desktop + narrow viewport, both
themes. Commands: `npm run lint`, `npm test`.
