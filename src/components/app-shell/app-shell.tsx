// C2 app shell: server half resolves data, ShellFrame renders the chrome.

import type { ReactNode } from 'react';

import { getProjectsForUser } from '@/components/project-list';
import { ShellFrame } from './shell-frame';

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
    <ShellFrame
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      sidebarFooter={sidebarFooter}
      topbarRight={topbarRight}
    >
      {children}
    </ShellFrame>
  );
}
