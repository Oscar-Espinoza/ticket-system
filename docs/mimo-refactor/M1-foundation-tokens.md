# M1 — Foundation: fonts, tokens, themes, metadata

Depends on: M0 (baseline). Blocks: M2 (shell consumes C1), everything downstream.

## Goal

Establish the complete Linear design language at the token level and fix all
foundation defects, so every later milestone styles against a frozen, correct
palette/type/motion system.

## Scope

1. **Font fix** (`src/app/globals.css`, `src/app/layout.tsx`)
   - `--font-sans: var(--font-geist-sans)` (cures the Times-New-Roman headings);
   - `--font-heading` resolves through the fixed `--font-sans`;
   - keep Geist (already loaded, ships `--font-geist-mono` correctly).
2. **C1 token set** (`globals.css` only)
   - Dark-first Linear palette: bg `#08090A`, surface `#101011`, borders
     `rgba(255,255,255,.06–.08)`, muted fg `#8A8F98`, accent/brand `#5E6AD2`,
     plus a complete light theme with the same semantic names;
   - status color tokens for the five `ticket_status` values (gray/gray/
     amber/violet/red) — consumed by M4's StatusIcon;
   - type scale: 13px app base, 11px uppercase section labels, weight 500 for
     headings (replaces 600 semibold);
   - radius: 0.375–0.5rem (from 0.625rem);
   - motion: single `--duration`/easing token, ~120–160ms ease-out;
   - borders as elevation; shadows only for popover/dialog.
3. **Theme provider**: add `next-themes`, wire into root layout,
   `defaultTheme="system"`, `suppressHydrationWarning` on `<html>`. No toggle UI
   (owned by M3; default flip to dark also owned by M3).
4. **Metadata**: real `title`/`description`, favicon; remove "Create Next App".
5. **`/` route**: replace stock template page with a redirect to `/dashboard`
   (auth guard then sends unauthenticated users to `/login`).
6. **Auth pages restyle** (`(auth)/login`, `(auth)/signup`): Linear-style centered
   card on themed background, wordmark/logo above the card, C1 type/radius/motion.
   These pages live outside the shell permanently, so they are fully owned here.

## Out of scope (owner in parentheses)

- Any layout/shell/sidebar work (M2)
- Theme toggle UI, default flip to dark, toasts, hotkeys (M3)
- Icon system, row density, badge audit (M4)
- Issue/board/detail views (M5–M7)
- Dashboard/project/members page chrome — those headers get DELETED by M2, so
  polishing them here would be wasted work (M2)

## Contracts

- Provides: **C1** (token names/semantics).
- Consumes: none.

## Allowed future touches (by later milestones)

- M8 may tune C1 token *values* (never rename, never remove).

## Acceptance criteria

- [ ] `npm run lint` and `npm test` pass.
- [ ] Card titles render in Geist, not serif (verified via `/login` computed style
      or screenshot).
- [ ] `/` redirects to `/dashboard`; unauthenticated `/dashboard` lands on `/login`.
- [ ] `<title>` no longer contains "Create Next App".
- [ ] Both themes render complete (no unstyled/harsh-white flashes): verified by
      toggling the `class="dark"` attribute manually (toggle ships in M3).
- [ ] Auth pages use only C1 tokens (no hard-coded hex/gray-* utilities).

## Verification

Visual: `/login`, `/signup`, `/dashboard` (light + dark). Commands:
`npm run lint`, `npm test`.
