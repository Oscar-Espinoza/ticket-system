<!-- One milestone row (milestones-section.tsx MilestoneItem). -->
<script lang="ts">
  import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
  import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
  import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
  import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';

  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { Input } from '@/lib/components/ui/input';
  import { formatDueDate } from '@/lib/dates';
  import { cn } from '@/lib/utils';
  import { progressPercent, type MilestoneRow } from '@/components/epics/epic-model';
  import DatePicker from './date-picker.svelte';
  import EpicProgress from './epic-progress.svelte';
  import MilestoneGlyph from './milestone-glyph.svelte';

  let {
    milestone,
    color,
    canWrite,
    isFirst,
    isLast,
    onMove,
    onRename,
    onTargetDate,
    onDelete,
  }: {
    milestone: MilestoneRow;
    color: string | null;
    canWrite: boolean;
    isFirst: boolean;
    isLast: boolean;
    onMove: (delta: -1 | 1) => void;
    onRename: (name: string) => void;
    onTargetDate: (date: string | null) => void;
    onDelete: () => void;
  } = $props();

  let editing = $state(false);
  // svelte-ignore state_referenced_locally
  let name = $state(milestone.name);
  const done = $derived(milestone.progress.total > 0 && progressPercent(milestone.progress) === 100);

  const commit = () => {
    editing = false;
    const next = name.trim();
    if (next && next !== milestone.name) onRename(next);
    else name = milestone.name;
  };
</script>

<!-- focusable row: Alt+↑/↓, Enter, as in React -->

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  role="listitem"
  tabindex="0"
  data-milestone-row={milestone.id}
  aria-label={milestone.name}
  onkeydown={(event) => {
    if (event.target !== event.currentTarget || !canWrite) return;
    if (event.altKey && event.key === 'ArrowUp') {
      event.preventDefault();
      onMove(-1);
    } else if (event.altKey && event.key === 'ArrowDown') {
      event.preventDefault();
      onMove(1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      name = milestone.name;
      editing = true;
    }
  }}
  class={cn(
    'group flex min-h-10 items-center gap-2 border-b border-border px-3 py-1 text-sm outline-none last:border-b-0',
    'focus-visible:bg-accent',
    milestone.id.startsWith('temp-') && 'opacity-60',
  )}
>
  <MilestoneGlyph {done} {color} />
  <div class="min-w-0 flex-1">
    {#if editing}
      <!-- React autoFocus: always focus on mount (Svelte's `autofocus` only does when
           nothing else has focus, and the row keeps it after Enter). -->
      <Input
        {@attach (node: HTMLElement) => node.focus()}
        bind:value={name}
        maxlength={80}
        aria-label="Milestone name"
        class="h-7"
        onblur={commit}
        onkeydown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            name = milestone.name;
            editing = false;
          }
        }}
      />
    {:else}
      <button
        type="button"
        disabled={!canWrite}
        class="max-w-full truncate text-left disabled:cursor-default"
        onclick={() => {
          name = milestone.name;
          editing = true;
        }}
      >
        {milestone.name}
      </button>
    {/if}
  </div>

  <EpicProgress progress={milestone.progress} {color} showCounts />

  {#if canWrite}
    <DatePicker value={milestone.targetDate} onChange={onTargetDate} align="end">
      {#snippet children({ props })}
        <Button
          {...props}
          variant="ghost"
          size="xs"
          class="w-24 justify-start font-normal text-muted-foreground"
        >
          <CalendarDaysIcon />
          {milestone.targetDate ? formatDueDate(milestone.targetDate) : 'Target'}
        </Button>
      {/snippet}
    </DatePicker>
  {:else}
    <span class="w-24 text-xs text-muted-foreground">
      {milestone.targetDate ? formatDueDate(milestone.targetDate) : ''}
    </span>
  {/if}

  {#if canWrite}
    <DropdownMenu>
      <DropdownMenuTrigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon-xs"
            aria-label={`Actions for ${milestone.name}`}
            class="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
          >
            <EllipsisIcon />
          </Button>
        {/snippet}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-44">
        <DropdownMenuItem disabled={isFirst} onSelect={() => onMove(-1)}>
          <ArrowUpIcon />
          Move up
          <span class="ml-auto text-xs text-muted-foreground">Alt ↑</span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={isLast} onSelect={() => onMove(1)}>
          <ArrowDownIcon />
          Move down
          <span class="ml-auto text-xs text-muted-foreground">Alt ↓</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2Icon />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  {/if}
</div>
