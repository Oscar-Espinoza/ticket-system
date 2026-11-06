<!-- "No due date" drop zone + list. Renders inside the DragDropProvider. -->
<script lang="ts">
  import { createDroppable } from '@dnd-kit/svelte';
  import CalendarX2Icon from '@lucide/svelte/icons/calendar-x-2';

  import type { IssueRow } from '@/lib/issue-model';
  import { cn } from '@/lib/utils';
  import { NO_DATE } from './calendar-ids';
  import CalendarDraggableChip from './calendar-draggable-chip.svelte';

  let { issues, onSelect }: { issues: IssueRow[]; onSelect?: (issue: IssueRow) => void } = $props();

  const droppable = createDroppable({ id: NO_DATE, accept: 'issue' });
</script>

<aside
  {@attach droppable.attach}
  aria-label="No due date"
  class={cn(
    'hidden w-64 shrink-0 flex-col gap-1 rounded-md border border-border p-2 transition-colors lg:flex',
    droppable.isDropTarget && 'bg-accent',
  )}
>
  <h2 class="flex items-center gap-1.5 px-1 pb-1 text-xs font-medium text-muted-foreground">
    <CalendarX2Icon class="size-3.5" aria-hidden="true" />
    No due date
    <span class="tabular-nums">{issues.length}</span>
  </h2>
  <div class="flex max-h-[calc(100dvh-18rem)] flex-col gap-1 overflow-y-auto">
    {#if issues.length === 0}
      <p class="px-1 py-4 text-center text-xs text-muted-foreground">Every issue has a due date.</p>
    {:else}
      {#each issues as issue (issue.id)}
        <CalendarDraggableChip {issue} {onSelect} />
      {/each}
    {/if}
  </div>
</aside>
