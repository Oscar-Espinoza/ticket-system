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
// C2 slots (filled by dashboard/layout.tsx):
//   - sidebarFooter: M3 replaced the footer default (raw email + logout
//     button) wholesale with the avatar UserMenu — the old fallback was
//     DELETED, not hidden (M3 acceptance), which is why there is no
//     `?? default` here anymore; this is the slot default itself, the one
//     AppShell edit M3's "diff touches slots" allows.
//   - topbarRight: M3's TopbarChrome (palette trigger + palette + overlay +
//     hotkeys + Toaster).
// Later milestones pass/extend slot content only — never frame internals.

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
  /**
   * C2 composition slot — NO default: the layout always fills it (M3's
   * avatar menu). Rendering an empty slot must not resurrect the old
   * standalone logout control ("deleted, not hidden").
   */
  sidebarFooter?: ReactNode;
  /** C2 composition slot — M3's TopbarChrome fills it. */
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
