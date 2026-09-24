# M5 — Issue list, filters, view switcher

Depends on: M4 (C4), **GSD Phase 5 ticket server actions** (hard blocker — see
README). Blocks: M6 (board reuses its data/actions), M7 (detail opens from its
rows). Consumes C3 (hotkeys) and provides C5.

## Goal

The project page becomes a Linear issue tracker: grouped dense rows, filters,
list-scoped keyboard navigation, and a view switcher that M6 extends.

## Scope

1. **Ticket read path UI** (`dashboard/projects/[id]/page.tsx` content area):
   - Issue rows: `StatusIcon` + mono key (`FOO-12`) + title + `Avatar` +
     relative date (labels omitted — README amendment 1) — all composed from C4, laid out at M4 density.
   - Grouped by status with sticky group headers (icon + name + count).
   - Loading: `Skeleton` row list; no tickets: `EmptyState` with create CTA.
2. **View switcher**: segmented List/Board control above the list. M5 ships the
   control with the List view only; the Board entry point (and its enabled state)
   is added by M6 via the switcher's registry — no disabled placeholder tab
   (D-21).
3. **Filters**: status and assignee filter (URL search params as source of truth,
   so links are shareable); clear-filter affordance.
4. **New issue**: quick-create dialog (title + optional description) wired to the
   Phase 5 `createTicket` action; toast on success (M3 sonner); palette gains a
   "New issue" command via C3/command registry, scoped to project routes.
5. **List hotkeys** (registered through C3 only): `j`/`k` row cursor, `Enter` open
   (opens detail — M7; until M7 lands, Enter navigates to the row's anchor/no-op
   is NOT acceptable, therefore Enter binding ships in M7 together with the
   detail pane), `s` opens the focused row's status menu (README amendment 2).

## Data dependency (explicit)

- Read: `tickets` table already queried by `getProjectsForUser`; per-project
  read query must come from Phase 5 DAL.
- Create/update: Phase 5 server actions. **M5 must not write DAL/action code
  itself.** If the GSD plan changes, this document is amended before M5 starts.

## Out of scope (owner in parentheses)

- Board rendering + drag-and-drop + Board switcher entry (M6)
- Issue detail pane, Enter-to-open, property editing (M7)
- Status/priority icon visuals (frozen C4 from M4)
- Comments/activity (no schema table exists; future M9 candidate — not part of
  this refactor plan)

## Contracts

- Provides: **C5** (issue row/group data shape fed to board + detail).
- Consumes: **C1**, **C2** (project nav entry via nav model), **C3**, **C4**.

## Allowed future touches (by later milestones)

- View switcher: M6 adds its Board entry through the registry API only.
- Palette commands: additive registration only (allowed by M3's contract).
- Row component: M7 may attach an `onSelect` prop (additive, non-breaking).

## Acceptance criteria

- [x] `npm run lint` and `npm test` pass.
- [x] `/dashboard/projects/[id]` shows issues grouped by all five statuses with
      correct icons; filters reflected in the URL and restorable on reload.
- [x] `j`/`k` move the row cursor with visible focus; `?` overlay lists them.
- [x] New-issue dialog creates a row without full-page reload (toast confirms).
- [x] Empty project shows `EmptyState`, not an empty table.
- [x] No board UI, no detail UI, no DAL code exists after M5 (scope check).

## Verification

Visual + keyboard on the project route (populated and empty project, both themes).
Commands: `npm run lint`, `npm test`.
