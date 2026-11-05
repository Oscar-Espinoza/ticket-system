<script lang="ts">
  import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';

  import { relativeTime } from '@/lib/components/issues/issue-properties';
  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { Avatar } from '@/lib/components/ui-icons';
  import type { EpicUpdateRow } from '@/lib/components/epics/epic-model';
  import HealthChip from './health-chip.svelte';
  import RichText from './rich-text.svelte';

  const absolute = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

  let {
    update,
    canDelete = false,
    onDelete,
    compact = false,
  }: {
    update: EpicUpdateRow;
    canDelete?: boolean;
    onDelete?: () => void;
    /** Clamp the body (overview excerpt). */
    compact?: boolean;
  } = $props();

  const createdAt = $derived(new Date(update.createdAt));
</script>

<article class="flex flex-col gap-2 rounded-md border border-border p-3">
  <header class="flex items-center gap-2 text-sm">
    <HealthChip health={update.health} class="font-medium" />
    <span class="text-muted-foreground">·</span>
    <Avatar name={update.author?.name ?? 'Someone'} src={update.author?.image} size={20} />
    <span class="truncate">{update.author?.name ?? 'Someone'}</span>
    <time
      datetime={createdAt.toISOString()}
      title={absolute.format(createdAt)}
      class="text-xs text-muted-foreground"
    >
      {relativeTime(createdAt)}
    </time>
    {#if canDelete && onDelete}
      <DropdownMenu>
        <DropdownMenuTrigger>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="icon-xs" class="ml-auto" aria-label="Update actions">
              <EllipsisIcon />
            </Button>
          {/snippet}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2Icon />
            Delete update
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    {/if}
  </header>
  <RichText source={update.body} class={compact ? 'line-clamp-4' : undefined} />
</article>
