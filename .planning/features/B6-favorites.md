# B6 — Favorites

## Goal
Star issues, views (and projects, epics, cycles, initiatives from other
agents' pages) and reach them from a sidebar section.

## UX
- `FavoriteButton` star (pre-created) in the issue detail header
  (`HeaderFavorite` slot) and on saved view rows / view page header.
- Sidebar "Favorites" section (hidden when empty): one row per favorite with a
  type icon (issues show their state icon + key), links to the target, and an
  × button on hover/focus to remove.

## Data
- `src/lib/favorites.ts`: `getSidebarFavorites(userId)` — load favorite rows,
  then one `db.batch` resolving each type with an access check in SQL:
  project (member), issue (member, not deleted), view (visible per views
  rules), epic/cycle (member of their project), initiative (workspace member).
  Unresolvable rows are skipped (not deleted). Ordered by `sort_order`.
  `getFavoritedIds(userId, type)` for server-rendered initial star state.
- Mutations: existing `toggleFavorite` (revalidates the dashboard layout, so
  the sidebar refreshes); added `removeFavorite(id)` convenience is not needed —
  removal uses toggleFavorite with the row's type/id.

## Files
`src/lib/favorites.ts`, `src/components/app-shell/slots/sidebar-favorites.tsx`,
`src/components/navigation/sidebar-favorites-list.tsx`,
`src/components/issue-detail/slots/header-favorite.tsx`,
`src/components/navigation/favorite-button.tsx`.

## Edge cases
- Pending (temp) issues render no star. Star keyed by target id so switching
  issues in the pane doesn't flash the previous state.
- Lost access → silently omitted from the sidebar.
