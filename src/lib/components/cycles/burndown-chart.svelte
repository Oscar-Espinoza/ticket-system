<!-- Burndown (cycle page): server-computed cycle stats → the generic line chart. -->
<script lang="ts">
  import LineChart from '@/lib/components/charts/line-chart.svelte';
  import {
    DAY_MS,
    completedOf,
    cycleLengthDays,
    formatCycleDay,
    formatWeekday,
    scopeOf,
    type BurndownPoint,
    type ChartUnit,
    type CycleTotals,
  } from '@/components/cycles/cycle-utils';
  import ChartCard from './chart-card.svelte';

  let {
    cycle,
    points,
    estimatesEnabled,
  }: {
    cycle: { startsAt: Date; endsAt: Date };
    points: BurndownPoint[];
    estimatesEnabled: boolean;
  } = $props();

  // svelte-ignore state_referenced_locally — initial unit only, like useState.
  let unit = $state<ChartUnit>(estimatesEnabled ? 'points' : 'issues');
  const effective: ChartUnit = $derived(estimatesEnabled ? unit : 'issues');
  const days = $derived(cycleLengthDays(cycle));
  const start = $derived(new Date(cycle.startsAt).getTime());

  const chart = $derived.by(() => {
    if (points.length === 0) return null;
    const last = points[points.length - 1];
    const lastScope = scopeOf(last.totals, effective);
    // x positions are day boundaries: 0 = start, k = end of day k.
    const labels = Array.from({ length: days + 1 }, (_, k) => formatCycleDay(start + k * DAY_MS));
    const pointLabels = labels.map((_, k) => {
      if (k === 0) return `Start · ${formatWeekday(start)}`;
      const inProgress =
        k === points.length - 1 && new Date(last.at).getTime() < start + k * DAY_MS - 1;
      return inProgress ? 'Now' : `End of ${formatWeekday(start + (k - 1) * DAY_MS)}`;
    });
    const at = (k: number, pick: (t: CycleTotals) => number) =>
      k < points.length ? pick(points[k].totals) : null;
    return {
      lastScope,
      labels,
      pointLabels,
      series: [
        {
          id: 'scope',
          label: 'Scope',
          color: 'var(--muted-foreground)',
          values: labels.map((_, k) => at(k, (t) => scopeOf(t, effective))),
        },
        {
          id: 'ideal',
          label: 'Ideal',
          color: 'var(--muted-foreground)',
          variant: 'dashed' as const,
          values: labels.map((_, k) => lastScope * (1 - k / days)),
        },
        {
          id: 'remaining',
          label: 'Remaining',
          color: 'var(--primary)',
          variant: 'area' as const,
          values: labels.map((_, k) =>
            at(k, (t) => scopeOf(t, effective) - completedOf(t, effective)),
          ),
        },
      ],
    };
  });
</script>

<ChartCard title="Burndown" unit={effective} onUnit={(next) => (unit = next)} showUnit={estimatesEnabled}>
  {#if !chart}
    <p class="py-10 text-center text-sm text-muted-foreground">
      The burndown starts on {formatCycleDay(start)}.
    </p>
  {:else if chart.lastScope === 0}
    <p class="py-10 text-center text-sm text-muted-foreground">
      {effective === 'points' ? 'No estimated issues in this cycle yet.' : 'No issues in this cycle yet.'}
    </p>
  {:else}
    <LineChart
      title="Burndown in {effective}"
      labels={chart.labels}
      pointLabels={chart.pointLabels}
      series={chart.series}
    />
  {/if}
</ChartCard>
