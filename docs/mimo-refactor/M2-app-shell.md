# M2 — App shell: sidebar + topbar

Depends on: M1 (C1 tokens). Blocks: M3 (fills its slots), M4–M7 (all pages render
inside it).

## Goal

One persistent Linear-style application frame. Every authenticated page becomes
content-only; all chrome lives in exactly one place.

## Scope

1. **`components/app-shell/`** (new)
   - Sidebar (~220px, C1 tokens):
     - workspace header (app wordmark + collapse control);
     - nav section: Projects (active states via route);
     - **server-rendered project list** — reuse `getProjectsForUser` from
       `project-list.tsx` (export stays where it is; the sidebar imports it);
     - `sidebarFooter` composition slot — ships with the EXISTING logout control
       moved verbatim (M3 replaces it with the avatar menu; no redesign here).
   - Topbar: breadcrumb (`Projects / <project>` — derived from route), `topbarRight`
     composition slot (ships empty; M3 puts the palette trigger there).
   - Full-width content area (`<main>`), replacing `max-w-4xl` centering.
2. **`dashboard/layout.tsx`**: keep the auth guard exactly as-is (security boundary,
   D-10); wrap its children in `<AppShell>` below the guard.
3. **Delete hand-rolled headers** from `dashboard/page.tsx`,
   `dashboard/projects/[id]/page.tsx`, `dashboard/projects/[id]/members/page.tsx`;
   migrate their contents (greeting, GitHub badge, back-link, project header) into
   the content area unchanged — visual redesign of those blocks is M4's job.

## Out of scope (owner in parentheses)

- Command palette, hotkeys, toasts, theme toggle, avatar menu (M3)
- Visual redesign of greeting/badges/project rows (M4 — here they only MOVE)
- Issue list/board/detail chrome (M5–M7)
- Collapsed-sidebar persistence beyond a simple state (M8 audits; keep minimal)

## Contracts

- Provides: **C2** (`AppShell` API: `sidebarFooter`, `topbarRight` slots; nav model;
  content area).
- Consumes: **C1**.

## Allowed future touches (by later milestones)

- `dashboard/layout.tsx`: M3+ may pass React nodes into the C2 slots — never edit
  AppShell internals or the auth guard.
- Sidebar nav gains new entries only via the C2 nav model (M5 adds project-scoped
  nav; M6/M7 add none).

## Acceptance criteria

- [ ] `npm run lint` and `npm test` pass.
- [ ] Exactly one `<header>`-equivalent exists app-wide (the AppShell topbar);
      zero duplicated `h-14` headers remain.
- [ ] `/dashboard`, `/dashboard/projects/[id]`, `.../members` all render inside the
      shell; sidebar project list matches the main list's data (same query).
- [ ] Logout still works (moved, not rewritten).
- [ ] Auth guard behavior unchanged: unauthenticated `/dashboard` still redirects
      to `/login` (covered by existing routing tests).
- [ ] Keyboard: sidebar links reachable by Tab with visible focus (C1 focus ring).

## Verification

Visual: the three routes above + auth-guard redirect check.
Commands: `npm run lint`, `npm test`.
