<!--
  App shell. The server half resolved the projects and the async sidebar slots; here the
  dashboard layout load does that (app-shell.server.ts → loadAppShellData) and
  passes the results in as props. ShellFrame renders the chrome.
-->
<script module lang="ts">
  import type { Snippet } from 'svelte';

  import type { SidebarFavorite } from '@/lib/favorites';
  import type { ShellProject } from './shell-frame.svelte';
  import type { SidebarWorkspace } from './sidebar-types';

  export interface AppShellUser {
    id: string;
    email?: string | null;
    name?: string | null;
  }

  export interface AppShellProps {
    /** Session user resolved by the layout's guard (server-side, no re-fetch). */
    user: AppShellUser;
    /** Sidebar projects (getProjectsForUser, mapped to the shell's fields). */
    projects: ShellProject[];
    /** Sidebar favorites (getSidebarFavorites). */
    favorites: SidebarFavorite[];
    /** Sidebar workspaces (getUserWorkspaces). */
    workspaces: SidebarWorkspace[];
    /** Unread inbox count (streamed from the layout load). */
    inboxCount: Promise<number> | number;
    children?: Snippet;
    sidebarFooter?: Snippet;
    topbarRight?: Snippet;
  }
</script>

<script lang="ts">
  import NavigationCommands from '@/lib/components/navigation/navigation-commands.svelte';
  import ShellFrame from './shell-frame.svelte';
  import InboxBadge from './slots/inbox-badge.svelte';
  import SidebarFavorites from './slots/sidebar-favorites.svelte';
  import SidebarWorkspaces from './slots/sidebar-workspaces.svelte';

  let { projects, favorites, workspaces, inboxCount, children, sidebarFooter, topbarRight }: AppShellProps =
    $props();
</script>

{#snippet inboxBadge()}<InboxBadge count={inboxCount} />{/snippet}
{#snippet favoritesSlot()}<SidebarFavorites items={favorites} />{/snippet}
{#snippet workspacesSlot()}<SidebarWorkspaces {workspaces} />{/snippet}

<!-- Outside the sidebar so palette commands survive a collapsed sidebar. -->
<NavigationCommands />
<ShellFrame
  {projects}
  {sidebarFooter}
  {topbarRight}
  {inboxBadge}
  favorites={favoritesSlot}
  workspaces={workspacesSlot}
>
  {@render children?.()}
</ShellFrame>
