// Server half of src/components/app-shell/app-shell.tsx and its async slots
// (slots/inbox-badge, slots/sidebar-favorites, slots/sidebar-workspaces): the
// data the shell renders, resolved once by src/routes/dashboard/+layout.server.ts
// and passed to <AppShell> as props.

import { getProjectsForUser } from '@/lib/components/project-list.server';
import { getSidebarFavorites } from '@/lib/favorites';
import { countUnreadNotifications } from '@/lib/notifications/inbox';
import { getUserWorkspaces } from '@/lib/workspace-access';

import type { ShellProject } from './shell-frame.svelte';
import type { SidebarWorkspace } from './slots/sidebar-workspaces.svelte';

export async function loadAppShellData(userId: string) {
  // Memoized per request (React cache → kit shim): the dashboard page reuses it.
  const [projects, favorites, workspaces] = await Promise.all([
    getProjectsForUser(userId),
    // Slot owners: favorites (access re-checked in SQL) and workspaces.
    getSidebarFavorites(userId),
    getUserWorkspaces(userId),
  ]);

  // Inbox badge: streamed (not awaited) so the count query never holds up the
  // shell, as the React slot's own Suspense boundary did.
  const inboxCount = countUnreadNotifications(userId).catch((err) => {
    console.error('[inbox] unread count failed', err);
    return 0;
  });

  return {
    projects: projects.map(
      (p): ShellProject => ({ id: p.id, name: p.name, ticketKey: p.ticketKey, parentId: p.parentId }),
    ),
    favorites,
    workspaces: workspaces.map((w): SidebarWorkspace => ({ id: w.id, slug: w.slug, name: w.name })),
    inboxCount,
  };
}
