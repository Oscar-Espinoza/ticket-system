# M3 — Interaction layer: palette, hotkeys, toasts, theme, user menu

Depends on: M2 (C2 slots). Blocks: M5–M7 (they register hotkeys via C3).

## Goal

The "feels like Linear" verb layer: ⌘K command palette, global keyboard shortcuts,
toast feedback, dark-default theming, and an avatar user menu — all poured into
existing C2 slots with zero layout changes.

## Scope

1. **Command palette** (new `components/command-palette/`, shadcn `cmd`/`cmdk`):
   - `⌘K` / `Ctrl+K` opens; scoped to what exists: navigate projects, open members,
     create project (reuses `CreateProjectDialog`), trigger logout; theme command.
   - Trigger button rendered into the C2 `topbarRight` slot.
2. **Hotkey framework** (new `lib/` or `hooks/`): global listener + registry +
   `?` shortcut-overlay component. Global keys owned here: `⌘K`, `/` (focus palette
   search), `?` (overlay), `Esc` (close topmost layer). `C` = create project.
   - Later milestones register SCOPED keys through this registry only (C3).
3. **Toasts**: add `sonner`; replace InvitePanel's inline "Copied!" 2s flash with a
   toast; toast on project create/regenerate invite. Remove the now-dead inline
   feedback state.
4. **Theme**: sidebar footer gains a light/dark toggle (C2 slot); flip
   `next-themes` `defaultTheme` from `"system"` to `"dark"` (M1 wired the provider
   and explicitly deferred this flip here).
5. **Avatar menu** (shadcn `dropdown-menu`): replace the verbatim-moved
   logout-button + raw email in `sidebarFooter` with an Avatar dropdown (GitHub
   avatar or initials fallback, name/email header, theme toggle, logout).

## Out of scope (owner in parentheses)

- Shell/structure changes (frozen by C2)
- Issue-scoped shortcuts — `j/k`, status keys etc. register via C3 in M5/M6
- Icon system, row density (M4)
- Any new palette destinations beyond what exists (issues arrive with M5)

## Contracts

- Provides: **C3** (hotkey registry + overlay; palette command-extension point for
  M5's "New issue" command).
- Consumes: **C1**, **C2**.

## Allowed future touches (by later milestones)

- `dashboard/layout.tsx`: pass slot content only (already allowed by C2).
- Palette: M5 may add commands through the exported command registry — never by
  editing palette internals.
- Overlay: M5–M7 add entries via C3 registration, never their own listeners.

## Acceptance criteria

- [x] `npm run lint` and `npm test` pass.
- [x] `⌘K` opens palette from any dashboard route; `Esc` closes; focus returns to
      the trigger.
- [x] `?` shows an overlay listing ONLY currently-registered shortcuts.
- [x] Invite copy shows a toast (no inline "Copied!" label remains).
- [x] Fresh visit defaults to dark; toggle persists across reloads.
- [x] Logout reachable only through the avatar menu (old button deleted, not hidden).
- [x] No layout/CSS-structure changes vs M2 (diff touches slots + new files only).

## Verification

Visual + keyboard walk on `/dashboard` and project routes: `⌘K`, `/`, `?`, `Esc`,
`C`, Tab order through sidebar and avatar menu. Commands: `npm run lint`, `npm test`.
