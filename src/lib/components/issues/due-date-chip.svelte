<!--
  "Mar 4" — red when overdue, amber when due today (unless the issue is closed).
  `kind="followUp"` renders the follow-up date the same way.
-->
<script lang="ts">
  import CalendarClockIcon from '@lucide/svelte/icons/calendar-clock';
  import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';

  import { dueStatus, formatDueDate } from '@/lib/dates';
  import type { StateType } from '@/lib/issue-model';
  import { cn } from '@/lib/utils';
  import { isClosed } from '@/lib/workflow';

  let {
    dueDate,
    stateType,
    kind = 'due',
    class: className,
  }: {
    dueDate: string | null;
    stateType: StateType;
    kind?: 'due' | 'followUp';
    class?: string;
  } = $props();

  const TITLES = {
    due: { overdue: 'Overdue', today: 'Due today', upcoming: 'Due date' },
    followUp: { overdue: 'Follow-up overdue', today: 'Follow up today', upcoming: 'Follow-up date' },
  };

  const status = $derived(dueDate ? (isClosed(stateType) ? 'upcoming' : dueStatus(dueDate)) : null);
</script>

{#if dueDate}
  <span
    title={TITLES[kind][status ?? 'upcoming']}
    class={cn(
      'inline-flex h-5 shrink-0 items-center gap-1 rounded border border-border px-1.5 text-xs text-muted-foreground',
      status === 'overdue' && 'border-destructive/40 text-destructive',
      status === 'today' && 'border-amber-500/40 text-amber-600 dark:text-amber-400',
      className,
    )}
  >
    {#if kind === 'followUp'}
      <CalendarClockIcon class="size-3" aria-hidden="true" />
    {:else}
      <CalendarDaysIcon class="size-3" aria-hidden="true" />
    {/if}
    {formatDueDate(dueDate)}
  </span>
{/if}
