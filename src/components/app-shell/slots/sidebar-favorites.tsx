// Slot — owned by B6 (navigation). Rendered by AppShell (server) as its own
// sidebar section between the top-level links and Workspaces. Resolves the
// user's favorites (access re-checked in SQL) and hands plain rows to the
// client list. Also mounts navigation's global palette commands, since this
// is the one B6 node rendered on every dashboard page.

import { NavigationCommands } from '@/components/navigation/navigation-commands';
import { SidebarFavoritesList } from '@/components/navigation/sidebar-favorites-list';
import { getSidebarFavorites } from '@/lib/favorites';

export interface SidebarFavoritesProps {
  /** Session user id (already authenticated by the dashboard layout). */
  userId: string;
}

export async function SidebarFavorites({ userId }: SidebarFavoritesProps) {
  const items = await getSidebarFavorites(userId);
  return (
    <>
      <NavigationCommands />
      {items.length > 0 && <SidebarFavoritesList items={items} />}
    </>
  );
}
