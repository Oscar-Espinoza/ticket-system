# M4 — Visual system: icons, density, states

Depends on: M1 (C1), M2 (shell content area). Blocks: M5–M7 (they compose C4).

Goal: the Linear visual vocabulary — status/priority glyphs, chips, avatars,
skeletons, empty states — and a dense project list that uses it.

## Scope

1. **New primitives** (`components/ui-icons/` or equivalent — one folder, exported
   through a single barrel):
   - `StatusIcon`: five variants mapping 1:1 to the `ticket_status` enum —
     Backlog (dotted ring), Todo (ring), In Progress (amber partial arc, accepts
     `percent`), In Review (blue circle-dot), Done (violet filled + check).
     The enum is backlog/todo/in_progress/in_review/done (no "canceled").
     Inline SVG,
     `currentColor`-aware, 14/16px sizes.
   - `PriorityIcon`: none/low/medium/high bars + urgent dot (for M5's list).
   - `LabelChip`: colored dot + text, C1-based neutrals (data-driven color prop).
   - `Avatar`: GitHub image or deterministic initials fallback, 20/24px.
   - `Skeleton`: row/card variants (C1 shimmer, `prefers-reduced-motion` aware).
   - `EmptyState`: icon + title + description + CTA slot.
2. **Project list density** (`project-list.tsx` — owner touch, rework in place):
   Card-per-project → dense rows (~36px): name, mono key chip, role chip, open/
   resolved counts, hover `bg-accent/40`, full-row focus ring, `ChevronRight` on
   hover. Empty state switches to `EmptyState`.
3. **Badge audit**: replace default shadcn `Badge` usages (GitHub-connected,
   Owner/Member, ticket-key) with domain chips built on `LabelChip`/`StatusIcon`
   semantics; delete now-unused Badge imports (Badge component itself stays in
   `ui/` only if still used — otherwise remove the import, keep the file).
4. **Greeting/header blocks**: settle the dashboard greeting + GitHub status row at
   C1 type scale (they moved in M2; this milestone finalizes their look).

## Out of scope (owner in parentheses)

- Issue rows, grouping, filters (M5 — StatusIcon ships here, its row ships there)
- Board cards/columns (M6, composed from C4)
- Issue detail (M7)
- Changing C4 APIs afterwards (frozen; M5–M7 compose, never restyle)

## Contracts

- Provides: **C4** (primitive APIs above).
- Consumes: **C1**, **C2**.

## Allowed future touches (by later milestones)

- `project-list.tsx`: M5+ only if a palette/nav command needs a new destination —
  row rendering itself is frozen after M4.
- Barrel file: additive exports only.

## Acceptance criteria

- [x] `npm run lint` and `npm test` pass.
- [x] All five StatusIcon variants render correctly in isolation (temporary
      throwaway showcase page during dev, removed before commit) and match enum
      values via type check — `StatusIcon['status']` is literally the enum type.
- [x] `/dashboard` project list: card layout fully gone; rows keyboard-focusable,
      hover/focus states visible in both themes.
- [x] No default shadcn `Badge` visible anywhere in shipped routes.
- [x] Empty state renders `EmptyState` (no "No projects yet" ad-hoc markup).
- [x] Skeletons demonstrably used wherever a list suspends (add to project list
      loading path if none exists).

## Verification

Visual: `/dashboard` (+ empty-state variant), auth badge, both themes.
Commands: `npm run lint`, `npm test`.
