<!--
  Compact SLA indicator for list rows, board cards and the table (rendered
  when the "sla" display property is on): "2d left" / "5h left" / "Breached".
  Renders nothing when the issue has no SLA or is closed (the clock stopped).

  `SLA_TONE` and `slaText` are exported
  from this file's module script:
    import SlaChip, { SLA_TONE, slaText } from '@/lib/components/sla/sla-chip.svelte';
-->
<script module lang="ts">
  import { formatDuration, type SlaKind, type SlaStatus } from '@/lib/sla';

  export const SLA_TONE: Record<SlaKind, string> = {
    ok: 'text-emerald-600 dark:text-emerald-400',
    risk: 'text-amber-600 dark:text-amber-400',
    breached: 'text-destructive',
    met: 'text-muted-foreground',
    missed: 'text-muted-foreground',
  };

  /** Long form for the detail pane: "2d 4h left", "Overdue by 3h", "Met", "Missed". */
  export function slaText(status: SlaStatus): string {
    switch (status.kind) {
      case 'ok':
      case 'risk':
        return `${formatDuration(status.remaining)} left`;
      case 'breached':
        return `Overdue by ${formatDuration(status.remaining)}`;
      case 'met':
        return 'Met';
      case 'missed':
        return 'Missed';
    }
  }
</script>

<script lang="ts">
  import TimerIcon from '@lucide/svelte/icons/timer';

  import type { IssueRow } from '@/lib/issue-model';
  import { slaStatus } from '@/lib/sla';
  import { cn } from '@/lib/utils';
  import { useMinuteNow } from './use-now.svelte';

  let { issue, class: className }: { issue: IssueRow; class?: string } = $props();

  const now = useMinuteNow();

  const status = $derived.by(() => {
    const at = now.current;
    if (!issue.slaDueAt || at === null) return null;
    const s = slaStatus(issue, at);
    if (!s || s.kind === 'met' || s.kind === 'missed') return null;
    return s;
  });
  const breached = $derived(status?.kind === 'breached');
  const text = $derived(
    status ? (breached ? 'Breached' : `${formatDuration(status.remaining, true)} left`) : '',
  );
</script>

{#if status}
  <span
    title={breached ? `SLA breached ${formatDuration(status.remaining)} ago` : `SLA: ${text}`}
    class={cn(
      'inline-flex h-5 shrink-0 items-center gap-1 rounded border border-border px-1.5 text-xs tabular-nums',
      SLA_TONE[status.kind],
      breached && 'border-destructive/40',
      status.kind === 'risk' && 'border-amber-500/40',
      className,
    )}
  >
    <TimerIcon class="size-3" aria-hidden="true" />
    <span class="sr-only">SLA: </span>
    {text}
  </span>
{/if}
