<!--
  "SLA" row (time left / overdue / met, hidden without a
  deadline or once canceled) and the "In status" row (time in the current
  state; hover for the per-state history).
-->
<script module lang="ts">
  const dueFormat = new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
</script>

<script lang="ts">
  import TimerIcon from '@lucide/svelte/icons/timer';

  import PropertyRow from '@/lib/components/issue-detail/property-row.svelte';
  import type { IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { SLA_TONE, slaText } from '@/lib/components/sla/sla-chip.svelte';
  import TimeInStatus from '@/lib/components/sla/time-in-status.svelte';
  import { useMinuteNow } from '@/lib/components/sla/use-now.svelte';
  import type { IssueRow } from '@/lib/issue-model';
  import { slaStatus } from '@/lib/sla';
  import { cn } from '@/lib/utils';

  let { issue }: { issue: IssueRow; mutations: IssueMutations } = $props();

  const minuteNow = useMinuteNow();
  const now = $derived(minuteNow.current);
  // Row presence depends only on the issue, so SSR and hydration agree; the
  // countdown text fills in once the client clock is known.
  const showSla = $derived(issue.slaDueAt !== null && issue.state.type !== 'canceled');
  const status = $derived(showSla && now !== null ? slaStatus(issue, now) : null);
</script>

{#if showSla}
  <PropertyRow label="SLA">
    <span class="flex min-w-0 items-center gap-1.5 text-sm" title={`Due ${dueFormat.format(new Date(issue.slaDueAt!))}`}>
      <TimerIcon
        class={cn('size-3.5 shrink-0', status ? SLA_TONE[status.kind] : 'text-muted-foreground')}
        aria-hidden="true"
      />
      <span class={cn('tabular-nums', status && SLA_TONE[status.kind])}>
        {status ? slaText(status) : '—'}
      </span>
      {#if status && (status.kind === 'ok' || status.kind === 'risk')}
        <span class="truncate text-xs text-muted-foreground">
          · {dueFormat.format(new Date(issue.slaDueAt!))}
        </span>
      {/if}
    </span>
  </PropertyRow>
{/if}
<PropertyRow label="In status">
  <TimeInStatus {issue} {now} />
</PropertyRow>
