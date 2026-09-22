// AppShell — the server half of C2 (docs/mimo-refactor/M2-app-shell.md).
//
// One persistent Linear-style application frame for every authenticated page.
// The dashboard layout mounts this BELOW its auth guard (D-10 — the guard is
// never edited by this component or by later milestones).
//
// Data: a single getProjectsForUser() call (export stays in project-list.tsx,
// per the M2 spec) feeds BOTH the sidebar project list and the breadcrumb's
// id→name map, so the sidebar can never disagree with the main list.
//
// C2 slots:
//   - sidebarFooter: ships with the EXISTING logout control moved verbatim
//     from the old page headers. M3 replaces it with the avatar menu by
//     passing a node from dashboard/layout.tsx — AppShell internals are then
//     off-limits (M2 "Allowed future touches").
//   - topbarRight: ships empty; M3 mounts the command-palette trigger here.

import type { ReactNode } from 'react';

import { LogoutButton } from '@/components/logout-button';
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
  /** C2 composition slot — defaults to the moved logout control. */
  sidebarFooter?: ReactNode;
  /** C2 composition slot — ships empty (M3 fills it). */
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
      sidebarFooter={sidebarFooter ?? <DefaultSidebarFooter email={user.email} />}
      topbarRight={topbarRight}
    >
      {children}
    </ShellFrame>
  );
}

// The logout control MOVED VERBATIM (same component, unchanged) from the three
// hand-rolled page headers that M2 deletes; only its position changed.
function DefaultSidebarFooter({ email }: { email?: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      {email && (
        <span className="truncate px-2 text-xs text-muted-foreground">
          {email}
        </span>
      )}
      <div className="flex">
        <LogoutButton />
      </div>
    </div>
  );
}
