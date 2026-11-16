<!-- Velocity (cycles list): completed work per past cycle → the generic bar chart. -->
<script module lang="ts">
  import type { CycleTotals } from '@/lib/cycle-utils';

  export interface VelocityCycle {
    id: string;
    /** Short axis label, e.g. "C12". */
    label: string;
    name: string;
    totals: CycleTotals;
  }
</script>

<script lang="ts">
  import { m } from '@/lib/i18n';
  import BarChart from '@/lib/components/charts/bar-chart.svelte';
  import { completedOf, scopeOf, type ChartUnit } from '@/lib/cycle-utils';
  import ChartCard from './chart-card.svelte';

  let {
    cycles,
    estimatesEnabled,
  }: {
    /** Past cycles, oldest first. */
    cycles: VelocityCycle[];
    estimatesEnabled: boolean;
  } = $props();

  // svelte-ignore state_referenced_locally — initial unit only, like useState.
  let unit = $state<ChartUnit>(estimatesEnabled ? 'points' : 'issues');
  const effective: ChartUnit = $derived(estimatesEnabled ? unit : 'issues');
  const recent = $derived(cycles.slice(-3));
  const average = $derived(
    recent.length
      ? recent.reduce((sum, c) => sum + completedOf(c.totals, effective), 0) / recent.length
      : 0,
  );
  const noun = $derived(effective === 'points' ? m.projects_unit_points_name() : m.projects_unit_issues_name());
</script>

<ChartCard title={m.projects_velocity()} unit={effective} onUnit={(next) => (unit = next)} showUnit={estimatesEnabled}>
  {#if cycles.length === 0}
    <p class="py-8 text-center text-sm text-muted-foreground">
      {m.projects_velocity_empty()}
    </p>
  {:else}
    <p class="text-xs text-muted-foreground">
      <span class="text-base font-medium tabular-nums text-foreground">
        {Math.round(average * 10) / 10}
      </span>{' '}{m.projects_velocity_summary({ unit: noun, count: recent.length })}
    </p>
    <BarChart
      title={m.projects_velocity_title({ unit: noun })}
      seriesLabel={m.projects_velocity_series({ unit: noun })}
      bars={cycles.map((c) => ({
        label: c.label,
        value: completedOf(c.totals, effective),
        details: [
          { label: m.projects_velocity_detail_cycle(), value: c.name },
          { label: m.projects_velocity_detail_scope(), value: String(scopeOf(c.totals, effective)) },
        ],
      }))}
      reference={{ label: m.projects_velocity_average({ count: recent.length }), value: average }}
    />
  {/if}
</ChartCard>
