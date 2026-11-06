<script lang="ts">
  import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
  import PencilIcon from '@lucide/svelte/icons/pencil';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';

  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import type { ProjectLabel } from '@/lib/project-data-types';
  import { pluralize } from '@/lib/format';

  let {
    label,
    count,
    canEdit,
    onEdit,
    onDelete,
  }: {
    label: ProjectLabel;
    count: number;
    canEdit: boolean;
    onEdit: () => void;
    onDelete: () => void;
  } = $props();
</script>

<li class="flex min-h-10 items-center gap-2.5 px-3 py-1.5">
  <span
    class="size-2.5 shrink-0 rounded-full"
    style:background-color={label.color}
    aria-hidden="true"
  ></span>
  <button
    type="button"
    disabled={!canEdit}
    onclick={onEdit}
    class="flex min-w-0 flex-1 items-baseline gap-2 rounded text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default"
  >
    <span class="shrink-0 text-sm">{label.name}</span>
    {#if label.description}
      <span class="truncate text-xs text-muted-foreground">{label.description}</span>
    {/if}
  </button>
  <span class="shrink-0 text-xs text-muted-foreground tabular-nums">
    {pluralize(count, 'issue')}
  </span>
  {#if canEdit}
    <DropdownMenu>
      <DropdownMenuTrigger>
        {#snippet child({ props })}
          <Button {...props} variant="ghost" size="icon-xs" aria-label="Actions for {label.name}">
            <EllipsisIcon />
          </Button>
        {/snippet}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>
          <PencilIcon />
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2Icon />
          Delete…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  {/if}
</li>
