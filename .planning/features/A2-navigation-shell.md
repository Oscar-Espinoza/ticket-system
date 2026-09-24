# A2 — Navigation shell (sidebar, project tabs, breadcrumb)

## Goal
Linear-style chrome: a sidebar that reaches every top-level surface and every
project sub-page, project tabs inside a project, a breadcrumb that knows the new
routes, and keyboard/palette navigation.

## UX
- **Sidebar** (`app-shell/shell-frame.tsx`): wordmark + collapse button, then
  Search · Inbox (`<InboxBadge />`) · My issues · Views · Drafts; a Favorites
  section (`<SidebarFavorites />`), a Workspaces section (`<SidebarWorkspaces />`);
  **Your projects** header (links to `/dashboard`) and one collapsible per
  project with Issues · Triage · Cycles · Epics · Views · Settings. Open state
  per project in `localStorage` (`sidebar-project:<id>`, try/catch); default =
  open for the project in the URL. Keeps today's collapse (desktop, remembered)
  and narrow-screen overlay (closes on navigation).
- **Project tabs** (`project/project-tabs.tsx`): Issues, Triage, Cycles, Epics,
  Roadmap, Views, Insights as links styled as a line tab bar, plus a `…` menu
  (Archive, Trash, Members, Settings). Active state from pathname.
- **Breadcrumb**: `Project › Section › Detail` inside projects (issue key shown
  verbatim, other ids as generic "Cycle"/"Epic"/"View"), `Settings › Profile`,
  top-level page names elsewhere.
- **Palette**: Go to Inbox / My issues / Views / Drafts / Search / Settings /
  Projects; per current project: Issues, Triage, Cycles, Epics, Members, Settings.
- **Hotkeys**: `g` then `i` inbox, `m` my issues, `v` views, `d` drafts,
  `s` settings, `p` projects. `g` registers in the hotkey registry; the second
  key is caught by a one-shot capture listener (1 s window) that calls
  `preventDefault()`, so list-scoped single keys don't also fire. Listed in the
  `?` overlay as passive entries.

## Slots (stubs; host frozen after Wave A)
Rendered by the server `AppShell` and handed to the client `ShellFrame` as
nodes, so owners may write async server components (and nest client ones).
- `slots/inbox-badge.tsx` → `InboxBadge({ userId })` — B2. Rendered at the end
  of the Inbox link; return a small count pill or null.
- `slots/sidebar-favorites.tsx` → `SidebarFavorites({ userId })` — B6. Rendered
  as its own section; return null when empty.
- `slots/sidebar-workspaces.tsx` → `SidebarWorkspaces({ userId })` — B9.
Shared building blocks for slot owners: `app-shell/sidebar-nav.tsx`
(`SidebarLink`, `SidebarSection`) — same styles and active logic as the shell.

## Data
`getProjectsForUser` (project-list.tsx): counts now come from
`workflow_state.type` (completed/canceled = resolved), archived/deleted
tickets excluded in the join condition. Adds nothing else the sidebar needs.

## Files
`src/components/app-shell/{app-shell,shell-frame,breadcrumb,sidebar-nav,sidebar-projects,settings-nav}.tsx`, `app-shell/routes.ts` (shared route/label table),
`app-shell/slots/*`, `project/project-tabs.tsx`, `topbar-chrome.tsx`,
`user-menu.tsx`, `project-list.tsx`.

## Edge cases
- localStorage unavailable → defaults, no crash; SSR snapshot = defaults (no
  hydration mismatch, via `useSyncExternalStore`).
- `g` pressed then nothing → sequence expires after 1 s.
- Project removed / unknown id in URL → breadcrumb "Unknown project".
