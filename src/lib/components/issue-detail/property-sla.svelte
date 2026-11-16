<!--
  "SLA" row (time left / overdue / met, hidden without a
  deadline or once canceled) and the "In status" row (time in the current
  state; hover for the per-state history).
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import TimerIcon from '@lucide/svelte/icons/timer';

  import PropertyRow from '@/lib/components/issue-detail/property-row.svelte';
  import type { IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { SLA_TONE, slaText } from '@/lib/components/sla/sla-chip.svelte';
  import TimeInStatus from '@/lib/components/sla/time-in-status.svelte';
  import { useMinuteNow } from '@/lib/components/sla/use-now.svelte';
  import type { IssueRow } from '@/lib/issue-model';
  import { dateFormat } from '@/lib/i18n';
  import { slaStatus } from '@/lib/sla';
  import { cn } from '@/lib/utils';

  let { issue }: { issue: IssueRow; mutations: IssueMutations } = $props();

  const dueText = (iso: string) =>
    dateFormat({ month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

  const minuteNow = useMinuteNow();
  const now = $derived(minuteNow.current);
  // Row presence depends only on the issue, so SSR and hydration agree; the
  // countdown text fills in once the client clock is known.
  const showSla = $derived(issue.slaDueAt !== null && issue.state.type !== 'canceled');
  const status = $derived(showSla && now !== null ? slaStatus(issue, now) : null);
</script>

{#if showSla}
  <PropertyRow label={m.issues_sla()}>
    <span class="flex min-w-0 items-center gap-1.5 text-sm" title={m.issues_sla_due({ date: dueText(issue.slaDueAt!) })}>
      <TimerIcon
        class={cn('size-3.5 shrink-0', status ? SLA_TONE[status.kind] : 'text-muted-foreground')}
        aria-hidden="true"
      />
      <span class={cn('tabular-nums', status && SLA_TONE[status.kind])}>
        {status ? slaText(status) : '—'}
      </span>
      {#if status && (status.kind === 'ok' || status.kind === 'risk')}
        <span class="truncate text-xs text-muted-foreground">
          · {dueText(issue.slaDueAt!)}
        </span>
      {/if}
    </span>
  </PropertyRow>
{/if}
<PropertyRow label={m.issues_in_status()}>
  <TimeInStatus {issue} {now} />
</PropertyRow>
