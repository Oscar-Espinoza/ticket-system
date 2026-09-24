# M8 — Polish, a11y, performance, final verification

Depends on: M1–M7 all shipped. Blocks: nothing — this is the closing milestone.

## Goal

Audit everything the earlier milestones built, close the gaps they were explicitly
allowed to defer, and produce the before/after evidence that the refactor is done.

## Scope

1. **Motion audit**: every transition uses C1's duration/easing token; no stray
   `duration-*`/`transition` utilities with ad-hoc values; global
   `prefers-reduced-motion` handling verified (Skeleton shimmer included).
2. **Focus & keyboard audit**: visible focus ring on EVERY interactive element
   (rows, selects, palette, sheet, board cards); documented tab order per route;
   `?` overlay matches the real registered set exactly; no focus traps outside
   modals; focus restoration verified for palette, sheet, detail pane.
3. **Skeleton coverage**: every async surface (project lists, issue list, board,
   detail) renders Skeleton states — no blank flashes.
4. **Empty/error state coverage**: every route has C4 `EmptyState`; action
   failures all toast (no silent catches added during the refactor).
5. **Token value tuning**: allowed C1 value adjustments (spacing rhythm, hover
   opacities, column widths) — NO renames, NO structural changes (ownership rule).
6. **Dead code sweep**: unused imports/components/CSS from the migration
   (`Badge`-related leftovers, removed inline feedback states, orphaned
   utilities); `npm run build` must pass clean.
7. **Metadata/branding**: per-route titles, favicon, OG tag — no scaffold text
   anywhere (grep for "Create Next App" returns nothing).
8. **Bundle sanity**: no client-component inflation — palette/hotkeys/board lazily
   loaded where trivial to do so; report (not enforce) bundle size deltas.
9. **Screenshot gallery**: capture before (M0 baseline) and after for every route
   in both themes; store under `docs/mimo-refactor/evidence/` as the refactor's
   acceptance record.

## Out of scope

- New features, schema changes, GSD Phase work (roadmap continues separately).
- Re-opening any milestone's component API (value-level fixes only).

## Contracts

- Provides: none.
- Consumes: C1–C5 (audit against them).

## Acceptance criteria (refactor done when all pass)

- [x] `npm run lint`, `npm test`, `npm run build` all pass.
- [x] Route × theme screenshot gallery complete (M0 vs final).
- [x] Keyboard-only traversal of every route completes all primary flows
      (create project, create issue, move issue, edit properties, invite copy,
      theme toggle, logout) with visible focus throughout.
- [x] `prefers-reduced-motion` respected; no ad-hoc animation values remain.
- [x] Grep-clean: no scaffold strings, no `min-h-screen bg-background` per-page
      wrappers, no duplicated headers, no hard-coded colors outside C1 tokens.
- [x] README's "Known foundation bugs" section verified fixed (font, dark mode,
      stock home page).

## Verification

Full manual sweep (gallery), keyboard-only walkthrough, then
`npm run lint && npm test && npm run build`.
