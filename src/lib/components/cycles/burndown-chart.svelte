<!-- Burndown (cycle page): server-computed cycle stats → the generic line chart. -->
<script lang="ts">
  import { m } from '@/lib/i18n';
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
  } from '@/lib/cycle-utils';
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
      if (k === 0) return m.projects_burndown_start({ weekday: formatWeekday(start) });
      const inProgress =
        k === points.length - 1 && new Date(last.at).getTime() < start + k * DAY_MS - 1;
      return inProgress ? m.projects_burndown_now() : m.projects_burndown_end_of({ weekday: formatWeekday(start + (k - 1) * DAY_MS) });
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
          label: m.projects_burndown_scope(),
          color: 'var(--muted-foreground)',
          values: labels.map((_, k) => at(k, (t) => scopeOf(t, effective))),
        },
        {
          id: 'ideal',
          label: m.projects_burndown_ideal(),
          color: 'var(--muted-foreground)',
          variant: 'dashed' as const,
          values: labels.map((_, k) => lastScope * (1 - k / days)),
        },
        {
          id: 'remaining',
          label: m.projects_burndown_remaining(),
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

<ChartCard title={m.projects_burndown()} unit={effective} onUnit={(next) => (unit = next)} showUnit={estimatesEnabled}>
  {#if !chart}
    <p class="py-10 text-center text-sm text-muted-foreground">
      {m.projects_burndown_starts_on({ date: formatCycleDay(start) })}
    </p>
  {:else if chart.lastScope === 0}
    <p class="py-10 text-center text-sm text-muted-foreground">
      {effective === 'points' ? m.projects_burndown_no_estimated() : m.projects_burndown_no_issues()}
    </p>
  {:else}
    <LineChart
      title={effective === 'points' ? m.projects_burndown_in_points() : m.projects_burndown_in_issues()}
      labels={chart.labels}
      pointLabels={chart.pointLabels}
      series={chart.series}
    />
  {/if}
</ChartCard>
