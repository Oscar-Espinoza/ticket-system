<!--
  Sidebar "Favorites" section. Removing unstars optimistically; the action
  refreshes the dashboard layout, which re-renders this list from the server.
-->
<script lang="ts">
  import BoxIcon from '@lucide/svelte/icons/box';
  import FolderKanbanIcon from '@lucide/svelte/icons/folder-kanban';
  import LayersIcon from '@lucide/svelte/icons/layers';
  import LayoutDashboardIcon from '@lucide/svelte/icons/layout-dashboard';
  import RefreshCcwIcon from '@lucide/svelte/icons/refresh-ccw';
  import TargetIcon from '@lucide/svelte/icons/target';
  import XIcon from '@lucide/svelte/icons/x';
  import type { Component } from 'svelte';
  import { toast } from 'svelte-sonner';

  import { toggleFavorite } from '@/lib/actions/favorites';
  import SidebarLink from '@/lib/components/app-shell/sidebar-link.svelte';
  import SidebarSection from '@/lib/components/app-shell/sidebar-section.svelte';
  import { StatusIcon } from '@/lib/components/ui-icons';
  import type { FavoriteTarget } from '@/lib/favorite-targets';
  import type { SidebarFavorite } from '@/lib/favorites';

  const TYPE_ICON: Record<FavoriteTarget, Component | null> = {
    project: FolderKanbanIcon,
    issue: null,
    view: LayersIcon,
    epic: BoxIcon,
    cycle: RefreshCcwIcon,
    initiative: TargetIcon,
    dashboard: LayoutDashboardIcon,
  };

  let { items }: { items: SidebarFavorite[] } = $props();

  // useOptimistic: ids removed while their toggle is in flight. Once the action
  // settles (and has refreshed `items`), the override is dropped.
  let removing = $state<string[]>([]);
  const shown = $derived(items.filter((item) => !removing.includes(item.id)));

  async function remove(item: SidebarFavorite) {
    removing = [...removing, item.id];
    try {
      const result = await toggleFavorite({ targetType: item.targetType, targetId: item.targetId });
      if (!result.ok) toast.error(result.error);
      // Already removed elsewhere, so the toggle re-added it — undo that.
      else if (result.favorited) await toggleFavorite({ targetType: item.targetType, targetId: item.targetId });
    } finally {
      removing = removing.filter((id) => id !== item.id);
    }
  }
</script>

{#if shown.length > 0}
  <SidebarSection title="Favorites">
    {#each shown as item (item.id)}
      {@const TypeIcon = TYPE_ICON[item.targetType]}
      <div class="group/fav relative">
        <SidebarLink href={item.href} label={item.label}>
          {#snippet icon()}
            {#if item.state}
              <StatusIcon type={item.state.type} color={item.state.color} aria-label={item.state.name} size={14} />
            {:else if TypeIcon}
              <TypeIcon />
            {/if}
          {/snippet}
        </SidebarLink>
        <button
          type="button"
          aria-label={`Remove ${item.label} from favorites`}
          title="Remove from favorites"
          onclick={() => remove(item)}
          class="absolute top-1/2 right-1 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground opacity-0 outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/fav:opacity-100 [&_svg]:size-3.5"
        >
          <XIcon />
        </button>
      </div>
    {/each}
  </SidebarSection>
{/if}
