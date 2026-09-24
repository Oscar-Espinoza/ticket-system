// Slot stub — owned by B6 (navigation). Rendered by AppShell (server) as its own
// sidebar section between the top-level links and Workspaces; may be async.
// Build rows with SidebarSection / SidebarLink from '../sidebar-nav' so they
// match the shell. Return null when the user has no favorites.

export interface SidebarFavoritesProps {
  /** Session user id (already authenticated by the dashboard layout). */
  userId: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- stub; owner uses the props
export function SidebarFavorites(_props: SidebarFavoritesProps) {
  return null;
}
