<script lang="ts">
  import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
  import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
  import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
  import Loader2Icon from '@lucide/svelte/icons/loader-circle';
  import PencilIcon from '@lucide/svelte/icons/pencil';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';
  import { toast } from 'svelte-sonner';

  import { moveWorkflowState } from '@/lib/actions/workflow-states';
  import { StateIcon } from '@/lib/components/ui-icons';
  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import type { WorkflowState } from '@/lib/issue-model';
  import { pluralize } from '@/lib/format';

  let {
    projectId,
    workflowState,
    count,
    canEdit,
    isFirst,
    isLast,
    onEdit,
    onDelete,
  }: {
    projectId: string;
    workflowState: WorkflowState;
    count: number;
    canEdit: boolean;
    isFirst: boolean;
    isLast: boolean;
    onEdit: () => void;
    onDelete: () => void;
  } = $props();

  let isPending = $state(false);

  async function move(direction: 'up' | 'down') {
    isPending = true;
    try {
      const result = await moveWorkflowState({ projectId, id: workflowState.id, direction });
      if (!result.ok) toast.error(result.error);
    } finally {
      isPending = false;
    }
  }
</script>

<li class="group flex min-h-10 items-center gap-2.5 px-3 py-1.5">
  <StateIcon state={workflowState} size={14} />
  <button
    type="button"
    disabled={!canEdit}
    onclick={onEdit}
    class="flex min-w-0 flex-1 items-baseline gap-2 rounded text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default"
  >
    <span class="shrink-0 text-sm">{workflowState.name}</span>
    {#if workflowState.description}
      <span class="truncate text-xs text-muted-foreground">{workflowState.description}</span>
    {/if}
  </button>
  <span class="shrink-0 text-xs text-muted-foreground tabular-nums">
    {pluralize(count, 'issue')}
  </span>
  {#if canEdit}
    <div class="flex shrink-0 items-center gap-0.5">
      {#if isPending}
        <Loader2Icon class="size-3.5 animate-spin text-muted-foreground" aria-label="Saving" />
      {:else}
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Move {workflowState.name} up"
          disabled={isFirst}
          onclick={() => move('up')}
          class="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 disabled:opacity-0"
        >
          <ArrowUpIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Move {workflowState.name} down"
          disabled={isLast}
          onclick={() => move('down')}
          class="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 disabled:opacity-0"
        >
          <ArrowDownIcon />
        </Button>
      {/if}
      <DropdownMenu>
        <DropdownMenuTrigger>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="icon-xs" aria-label="Actions for {workflowState.name}">
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
    </div>
  {/if}
</li>
