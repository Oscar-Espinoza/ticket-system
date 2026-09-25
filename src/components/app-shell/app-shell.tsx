// C2 app shell: server half resolves data, ShellFrame renders the chrome.
// Sidebar slots are rendered here (server-side) and passed down as nodes, so
// their owners can write async server components.

import type { ReactNode } from 'react';

import { NavigationCommands } from '@/components/navigation/navigation-commands';
import { getProjectsForUser } from '@/components/project-list';
import { ShellFrame } from './shell-frame';
import { InboxBadge } from './slots/inbox-badge';
import { SidebarFavorites } from './slots/sidebar-favorites';
import { SidebarWorkspaces } from './slots/sidebar-workspaces';

export interface AppShellUser {
  id: string;
  email?: string | null;
  name?: string | null;
}

export interface AppShellProps {
  /** Session user resolved by the layout's guard (server-side, no re-fetch). */
  user: AppShellUser;
  children: React.ReactNode;
  sidebarFooter?: ReactNode;
  topbarRight?: ReactNode;
}

export async function AppShell({
  user,
  children,
  sidebarFooter,
  topbarRight,
}: AppShellProps) {
  const projects = await getProjectsForUser(user.id);

  return (
    <>
      {/* Outside the sidebar so palette commands survive a collapsed sidebar. */}
      <NavigationCommands />
      <ShellFrame
        projects={projects.map((p) => ({
          id: p.id,
          name: p.name,
          ticketKey: p.ticketKey,
          parentId: p.parentId,
        }))}
        sidebarFooter={sidebarFooter}
        topbarRight={topbarRight}
        inboxBadge={<InboxBadge userId={user.id} />}
        favorites={<SidebarFavorites userId={user.id} />}
        workspaces={<SidebarWorkspaces userId={user.id} />}
      >
        {children}
      </ShellFrame>
    </>
  );
}
