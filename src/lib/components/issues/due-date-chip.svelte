<!--
  "Mar 4" — red when overdue, amber when due today (unless the issue is closed).
  Port of DueDateChip from src/components/issues/issue-properties.tsx.
-->
<script lang="ts">
  import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';

  import { dueStatus, formatDueDate } from '@/lib/dates';
  import type { StateType } from '@/lib/issue-model';
  import { cn } from '@/lib/utils';
  import { isClosed } from '@/lib/workflow';

  let {
    dueDate,
    stateType,
    class: className,
  }: {
    dueDate: string | null;
    stateType: StateType;
    class?: string;
  } = $props();

  const status = $derived(dueDate ? (isClosed(stateType) ? 'upcoming' : dueStatus(dueDate)) : null);
</script>

{#if dueDate}
  <span
    title={status === 'overdue' ? 'Overdue' : status === 'today' ? 'Due today' : 'Due date'}
    class={cn(
      'inline-flex h-5 shrink-0 items-center gap-1 rounded border border-border px-1.5 text-xs text-muted-foreground',
      status === 'overdue' && 'border-destructive/40 text-destructive',
      status === 'today' && 'border-amber-500/40 text-amber-600 dark:text-amber-400',
      className,
    )}
  >
    <CalendarDaysIcon class="size-3" aria-hidden="true" />
    {formatDueDate(dueDate)}
  </span>
{/if}
