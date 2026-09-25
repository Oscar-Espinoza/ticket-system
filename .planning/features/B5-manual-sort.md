# B5 — Manual sort order within a column

## Goal
Drag issues to reorder them inside a list group or a board column, persisted in `sortOrder`.

## UX
- Ordering "Manual": list rows and board cards are sortable (`@dnd-kit/react/sortable`).
  Items shift while dragging; dropping writes the new position.
- Board: moving into another column also applies the column (and lane) patch, at the
  dropped position. With another ordering active, cross-column drops still work and a
  same-column reorder shows a hint toast ("Switch ordering to Manual…").
- List drag is pointer-only (Space on a row belongs to peek preview); the board keeps
  Space pick-up + arrows.

## Data
- Live order kept in local state during the drag (`move()` from `@dnd-kit/helpers`
  in onDragOver), cleared on drop.
- New `sortOrder` = midpoint of the new neighbours (±1 at the ends), computed by
  `sortOrderBetween(prev, next)` in `issue-grouping.ts`; sent with the group patch in
  one `mutations.update`.

## Files
`src/components/board/board.tsx`, `board-card.tsx`, `src/components/issues/issue-list.tsx`,
`src/lib/issue-grouping.ts`.

## Edge cases
- Pending issues aren't draggable. Guests: dragging disabled.
- Label groups: an issue shown in several label columns moves out of the source label.
- Dropping back at the original index is a no-op (no server call).
