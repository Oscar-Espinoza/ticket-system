<!--
  Slot — owned by B6 (navigation). Rendered by AppShell as its own sidebar
  section between the top-level links and Workspaces. The user's favorites
  (access re-checked in SQL) are resolved by the dashboard layout load
  (getSidebarFavorites) and handed in as plain rows. (Navigation's palette
  commands are mounted by AppShell.)
  Port of src/components/app-shell/slots/sidebar-favorites.tsx.
-->
<script module lang="ts">
  import type { SidebarFavorite } from '@/lib/favorites';

  export interface SidebarFavoritesProps {
    /** getSidebarFavorites(session user id), from the dashboard layout load. */
    items: SidebarFavorite[];
  }
</script>

<script lang="ts">
  import SidebarFavoritesList from '@/lib/components/navigation/sidebar-favorites-list.svelte';

  let { items }: SidebarFavoritesProps = $props();
</script>

{#if items.length > 0}
  <SidebarFavoritesList {items} />
{/if}
