// Slot stub — owned by B9 (workspace). Rendered by AppShell (server) as its own
// sidebar section above "Your projects"; may be async. Build rows with
// SidebarSection / SidebarLink from '../sidebar-nav'. Return null when the user
// belongs to no workspace.

export interface SidebarWorkspacesProps {
  /** Session user id (already authenticated by the dashboard layout). */
  userId: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- stub; owner uses the props
export function SidebarWorkspaces(_props: SidebarWorkspacesProps) {
  return null;
}
