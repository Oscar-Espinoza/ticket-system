<!--
  Saved views list (global /dashboard/views and per-project views pages):
  open, star, and — for the owner — edit details or delete.
  Port of src/components/navigation/view-list.tsx. Also exports (module script)
  `viewHref` and the `ViewListItem` type:
    import ViewList, { viewHref, type ViewListItem } from '@/lib/components/navigation/view-list.svelte';
-->
<script module lang="ts">
  import type { SavedViewSummary } from '@/lib/views';

  export interface ViewListItem extends SavedViewSummary {
    favorited: boolean;
    /** The viewer may share views in this view's project (write access). */
    canShare: boolean;
  }

  export function viewHref(view: Pick<SavedViewSummary, 'id' | 'projectId'>) {
    return view.projectId ? `/dashboard/projects/${view.projectId}/views/${view.id}` : `/dashboard/views/${view.id}`;
  }
</script>

<script lang="ts">
  import LayersIcon from '@lucide/svelte/icons/layers';
  import MoreHorizontalIcon from '@lucide/svelte/icons/ellipsis';
  import PencilIcon from '@lucide/svelte/icons/pencil';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';
  import UsersIcon from '@lucide/svelte/icons/users';

  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { LabelChip } from '@/lib/components/ui-icons';
  import DeleteViewDialog from './delete-view-dialog.svelte';
  import EditViewDialog from './edit-view-dialog.svelte';
  import FavoriteButton from './favorite-button.svelte';
  import { relativeTime } from '@/lib/relative-time';

  let {
    views,
    showProject = true,
  }: {
    views: ViewListItem[];
    /** Show the project chip (off on a project's own views page). */
    showProject?: boolean;
  } = $props();

  let editing = $state<ViewListItem | null>(null);
  let deleting = $state<ViewListItem | null>(null);
</script>

<ul class="flex flex-col gap-px">
  {#each views as view (view.id)}
    <li class="group flex items-center gap-2 rounded-md pr-1 hover:bg-accent/40 focus-within:bg-accent/40">
      <a
        href={viewHref(view)}
        class="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <LayersIcon class="size-4 shrink-0 text-muted-foreground" />
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="truncate font-medium">{view.name}</span>
          {#if view.description}
            <span class="truncate text-xs text-muted-foreground">{view.description}</span>
          {/if}
        </span>
        {#if showProject && view.projectName}
          <LabelChip dot={false} class="hidden max-w-40 truncate sm:inline-flex">
            {view.projectName}
          </LabelChip>
        {/if}
        {#if view.shared}
          <span class="flex shrink-0 items-center gap-1 text-xs text-muted-foreground" title="Shared with project members">
            <UsersIcon class="size-3.5" />
            <span class="hidden md:inline">Shared</span>
          </span>
        {/if}
        <span class="hidden w-28 shrink-0 truncate text-right text-xs text-muted-foreground md:block">
          {view.isOwner ? 'You' : (view.ownerName ?? 'Former member')}
        </span>
        <!-- React's suppressHydrationWarning: hydration keeps the server text. -->
        <time
          datetime={new Date(view.updatedAt).toISOString()}
          title={`Updated ${new Date(view.updatedAt).toLocaleString()}`}
          class="hidden w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block"
        >
          {relativeTime(view.updatedAt)}
        </time>
      </a>
      <FavoriteButton targetType="view" targetId={view.id} initial={view.favorited} />
      {#if view.isOwner}
        <DropdownMenu>
          <DropdownMenuTrigger>
            {#snippet child({ props })}
              <Button {...props} variant="ghost" size="icon-sm" aria-label={`Actions for ${view.name}`}>
                <MoreHorizontalIcon />
              </Button>
            {/snippet}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-44">
            <DropdownMenuItem onSelect={() => (editing = view)}>
              <PencilIcon />
              Edit details
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => (deleting = view)}>
              <Trash2Icon />
              Delete view
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      {/if}
    </li>
  {/each}
</ul>

{#if editing}
  {#key editing.id}
    <EditViewDialog view={editing} onClose={() => (editing = null)} />
  {/key}
{/if}
<DeleteViewDialog view={deleting} onClose={() => (deleting = null)} />
