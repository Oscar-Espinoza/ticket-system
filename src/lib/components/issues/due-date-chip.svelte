<!--
  "Mar 4" — red when overdue, amber when due today (unless the issue is closed).
  `kind="followUp"` renders the follow-up date the same way.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
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
    due: { overdue: m.shared_due_overdue(), today: m.shared_due_today(), upcoming: m.shared_due_date() },
    followUp: { overdue: m.shared_followup_overdue(), today: m.shared_followup_today(), upcoming: m.shared_followup_date() },
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
