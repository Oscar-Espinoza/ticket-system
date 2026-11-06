<!-- One calendar day: drop target + up to MAX_CHIPS chips, the rest behind "+N more".
     Renders inside the DragDropProvider. -->
<script lang="ts">
  import { pluralize } from '@/lib/format';
  import { createDroppable } from '@dnd-kit/svelte';

  import { Popover, PopoverContent, PopoverTrigger } from '@/lib/components/ui/popover';
  import type { IssueRow } from '@/lib/issue-model';
  import { cn } from '@/lib/utils';
  import { dayDropId } from './calendar-ids';
  import CalendarDraggableChip from './calendar-draggable-chip.svelte';

  const MAX_CHIPS = 4;
  const dayFormat = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' });

  let {
    date,
    inMonth,
    today,
    issues,
    onSelect,
  }: {
    date: string;
    inMonth: boolean;
    today: boolean;
    issues: IssueRow[];
    onSelect?: (issue: IssueRow) => void;
  } = $props();

  const droppable = createDroppable({
    get id() {
      return dayDropId(date);
    },
    accept: 'issue',
  });

  const day = $derived(Number(date.slice(8)));
  const shown = $derived(issues.length > MAX_CHIPS ? issues.slice(0, MAX_CHIPS - 1) : issues);
  const rest = $derived(issues.slice(shown.length));
  const label = $derived(dayFormat.format(new Date(`${date}T00:00:00`)));
</script>

<div
  {@attach droppable.attach}
  role="gridcell"
  aria-label={`${label}, ${pluralize(issues.length, 'issue')}`}
  class={cn(
    'flex min-h-28 min-w-0 flex-col gap-1 border-r border-b border-border p-1 transition-colors',
    !inMonth && 'bg-muted/30',
    droppable.isDropTarget && 'bg-accent',
  )}
>
  <span
    class={cn(
      'flex size-6 items-center justify-center self-end rounded-full text-xs tabular-nums',
      today ? 'bg-primary font-medium text-primary-foreground' : inMonth ? 'text-foreground' : 'text-muted-foreground',
    )}
  >
    {day}
  </span>
  {#each shown as issue (issue.id)}
    <CalendarDraggableChip {issue} {onSelect} />
  {/each}
  {#if rest.length > 0}
    <Popover>
      <PopoverTrigger>
        {#snippet child({ props })}
          <button
            {...props}
            type="button"
            class="rounded px-1.5 text-left text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            +{rest.length} more
          </button>
        {/snippet}
      </PopoverTrigger>
      <PopoverContent align="start" class="flex w-72 flex-col gap-1 p-2">
        <p class="px-1 pb-1 text-xs font-medium text-muted-foreground">{label}</p>
        {#each rest as issue (issue.id)}
          <CalendarDraggableChip {issue} {onSelect} />
        {/each}
      </PopoverContent>
    </Popover>
  {/if}
</div>
