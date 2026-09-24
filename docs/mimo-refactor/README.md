# MIMO Refactor — Linear-style UI overhaul

Status: COMPLETE — M1–M8 shipped (plus GSD Phase 5 tickets core, built ahead of M5).
Branch: `refactor/linear-ui`, fast-forwarded into `main` after each milestone.
Execution will go through the GSD workflow required by CLAUDE.md; this directory is
the source plan each phase/plan derives from.

## Goal

Make the app look and feel like Linear: dark-first, dense, keyboard-driven, with the
status/priority iconography and list/board/detail views that define the Linear
experience — without touching auth, security boundaries (D-10/D-13), or the DAL.

## Non-goals

- No framework swap. Tailwind v4 + shadcn (`radix-nova`) stays; Linear's look is a
  token + shell + component problem, not a library problem.
- No backend/auth/DB changes except where a milestone explicitly declares them.
- No replacement of the project's GSD phase roadmap — milestones declare their
  dependencies on it (see M5).

## Milestones (strict order — M1 < M2 < ... < M8)

| # | Doc | One-liner |
|---|-----|-----------|
| M0 | (this file) | Baseline: branch + "before" screenshots of `/`, `/login`, `/signup` |
| M1 | [M1-foundation-tokens.md](M1-foundation-tokens.md) | Fonts, Linear design tokens, themes, metadata, auth-page restyle |
| M2 | [M2-app-shell.md](M2-app-shell.md) | Sidebar + topbar app shell; pages become content-only |
| M3 | [M3-interaction-layer.md](M3-interaction-layer.md) | Command palette, hotkey framework, toasts, theme toggle, avatar menu |
| M4 | [M4-visual-system.md](M4-visual-system.md) | Status/priority/label icon system, dense rows, skeletons, empty states |
| M5 | [M5-issue-list.md](M5-issue-list.md) | Issue list view, filters, view switcher, list-scoped hotkeys |
| M6 | [M6-board.md](M6-board.md) | Drag-and-drop kanban board |
| M7 | [M7-issue-detail.md](M7-issue-detail.md) | Issue detail pane with property editors |
| M8 | [M8-polish-a11y.md](M8-polish-a11y.md) | Motion/focus/a11y/perf audit, screenshot gallery, final verification |

Order is mandatory: each milestone consumes only contracts from milestones above it
and never implements work owned by a later one.

## Anti-overlap rules

1. **Contract freeze.** A contract (API, token name, component prop shape) once
   published by a milestone is read-only for all later milestones. Extensions are
   additive; breaking changes require editing this plan first, in the owning
   milestone's doc.
2. **Single owner per file/area.** The ownership matrix below assigns every touched
   area. Later milestones may only: (a) fill composition slots the owner exposes,
   (b) consume the owner's exported components, (c) make the exact deltas listed in
   the owner's doc as "allowed future touch" — nothing else.
3. **No dead UI.** A milestone ships no non-functional control (project rule D-21):
   if a control needs data or logic from a later milestone, it ships in the later
   milestone, not as a placeholder now.
4. **Verified at the boundary.** A milestone is done only when its own acceptance
   criteria pass (lint + tests + visual check of the listed routes). No milestone
   ends with "will be fixed in the next one".

## Cross-milestone contracts

| ID | Published by | Contract |
|----|--------------|----------|
| C1 | M1 | Token names/semantics in `globals.css`: palette (light+dark), type scale, radius, motion, borders. Later milestones consume utility classes only; M8 may tune values but never rename. |
| C2 | M2 | `AppShell` API: sidebar (workspace header, nav, server-rendered project list, `sidebarFooter` slot) + topbar (breadcrumb, `topbarRight` slot) + full-width content area. Later milestones pass content into slots; they never restructure the shell. |
| C3 | M3 | Hotkey framework + `?` overlay registry. M5–M7 register their scoped shortcuts here; they do not add their own global listeners. |
| C4 | M4 | Icon/chip primitives: `StatusIcon` (maps 1:1 to `ticket_status` enum), `PriorityIcon`, `LabelChip`, `Avatar`, `Skeleton`, `EmptyState`. M5–M7 compose these; they do not restyle them. |
| C5 | M5 | Ticket view data shape passed to list/board/detail (issue row props, group-by-status model). M6 and M7 consume it unchanged. |

## Ownership matrix

| Area | Owner |
|------|-------|
| `globals.css`, root `layout.tsx` metadata/fonts, `/` route, `(auth)/**`, `invite/[token]/**` | M1 (value-tune only: M8) |
| Existing `components/ui/**` shadcn primitives (token-application deltas only: shadow/duration/radius) | M1 (new primitives: M4) |
| `dashboard/layout.tsx`, new `components/app-shell/**`, per-page hand-rolled headers | M2 (slot-fill only afterwards: M3+) |
| Command palette, hotkey framework, toasts, theme toggle, avatar menu, theme default flip | M3 |
| New icon/primitive components, `project-list.tsx` row rendering | M4 |
| Project page view switcher, issue list, filters, list hotkey registrations | M5 |
| Board component + Board tab entry | M6 |
| Issue detail pane + property editors | M7 |
| Repo-wide audit (motion, focus, skeletons, metadata, dead code), `public/**` scaffold assets (`next.svg`, `vercel.svg`, …) | M8 |

## Dependencies on the GSD roadmap

- M1–M4 are independent of unexecuted GSD phases (they touch only existing surfaces).
- M5+ require ticket server actions/DAL (GSD Phase 5). If Phase 5 has not landed,
  M5–M7 are blocked; they must not implement DAL logic themselves. Read-only ticket
  data already exists (`project-list.tsx` counts) but create/update paths do not.
- M7's GitHub status display depends on Phase 7/8 data; render only what the data
  supports (D-21).

## Verification strategy (every milestone)

1. `npm run lint` and `npm test` pass.
2. Visual check on the milestone's listed routes, both themes where tokens apply
   (dev server: `npm run dev`; port 3000 may be occupied — Next falls back to 3001).
3. Before/after screenshots stored for the final gallery in M8.
4. Keyboard-only pass for any milestone shipping interactive UI (Tab order, Enter/Esc,
   visible focus).

## Repo constraints when implementing

- AGENTS.md: this Next.js version has breaking changes — read the relevant guide in
  `node_modules/next/dist/docs/` before writing code.
- CLAUDE.md: edits go through GSD commands (`/gsd-quick`, `/gsd-execute-phase`); this
  plan is the input artifact.
- Keep the security model intact: server-side session guard stays in
  `dashboard/layout.tsx`, `requireProjectMember()` before every project-scoped read.

## Plan amendments (2026-09-24)

1. **Priority and labels are out of scope.** The `ticket` table has no priority or
   label columns and no milestone owns a schema change, so M5–M7 omit them (D-21: no
   dead UI). `PriorityIcon` stays in C4 for a future phase; `LabelChip` is used only
   for existing domain chips (keys, roles, GitHub status).
2. **Status-menu hotkey is `s` everywhere.** M5's `x` clashed with M7's `X`-to-close,
   and Linear uses `S` for status. The detail pane closes with `Esc` (and its close
   button) only.
3. **GSD Phase 5 lands first.** The M5 blocker is resolved by building Phase 5
   (ticket DAL + server actions, `src/lib/tickets.ts`, `src/app/actions/tickets.ts`)
   as its own commit before M5; M5–M7 still contain no DAL code.

## Final gallery (M8)

Before shots are the `M0-before-*`, `M2-before-*`, `M3-before-*` and `M4-before-*`
files in `evidence/`. After shots per route:

| Route | Dark | Light |
|-------|------|-------|
| `/login`, `/signup` (unchanged since M1) | `M1-after-login-dark.png`, `M1-after-signup-dark.png` | `M1-after-login-light.png`, `M1-after-signup-light.png` |
| `/dashboard` | `M8-final-dashboard-dark.png` | `M8-final-dashboard-light.png` |
| Project — list | `M5-after-list-dark.png` | `M5-after-list-light.png` |
| Project — board | `M6-after-board-dark.png` | `M6-after-board-light.png` |
| Project — detail pane | `M7-after-pane-list-dark.png`, `M7-after-pane-board-dark.png` | `M8-final-pane-light.png` |
| Narrow viewport — detail sheet | `M7-after-sheet-narrow-dark.png` | — |
| Members | `M8-final-members-dark.png` | `M8-final-members-light.png` |
| Command palette | `M8-final-palette-dark.png`, `M3-after-palette.png` | — |

## Final notes (M8)

- Library versions: `@dnd-kit/react`/`@dnd-kit/helpers` pinned to 0.4.x per the
  project stack constraint (0.5.0 exists).
- Bundle: the board (dnd-kit, ~33 KB gzip) is lazy-loaded with `next/dynamic` and
  is not part of the project page's initial JS (~103 KB gzip across its 9 entry
  chunks). All client chunks total ~337 KB gzip.
- Known limitation: a collapsed sidebar is restored from localStorage after
  hydration, so collapsed users see a one-frame expanded sidebar on hard reload.
- Keyboard walkthrough (M8, browser-verified): Tab order and focus rings on the
  project page, palette, `?` overlay, create issue, move issue (board keyboard
  drag), edit status/assignee/title, pane open/close with focus return. Invite
  copy, theme toggle and logout were verified in M3 and not re-run here (logout
  would end the dev session). Issue deletion was exercised up to the confirm
  dialog in the browser; the delete action itself is covered by
  `src/tests/tickets.test.ts`.
- Hard-coded scrim colors (`bg-black/…` behind dialogs/sheet/mobile sidebar) are
  the only non-token colors left, by design.

## Known foundation bugs (evidence from plan-time review) — all fixed

Verified in M8: Geist renders everywhere (no serif), `.dark` is applied by
next-themes (dark default), `/` redirects to `/dashboard`, no "Create Next App"
string remains.


- `globals.css`: `--font-sans: var(--font-sans)` self-reference; Geist exposes
  `--font-geist-sans`, never mapped → headings render in Times New Roman (visible in
  plan-time `/login` screenshot).
- `.dark` token block exists but nothing ever applies the class — no theme provider.
- `/` renders the stock create-next-app template; `metadata.title` is
  "Create Next App".
- Three pages hand-roll an identical `h-14` header; content is a centered
  `max-w-4xl` column; logout is a raw text button; project list is default shadcn
  Cards — none of it reads as Linear.
