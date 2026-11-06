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
  const noun = $derived(effective === 'points' ? 'points' : 'issues');
</script>

<ChartCard title="Velocity" unit={effective} onUnit={(next) => (unit = next)} showUnit={estimatesEnabled}>
  {#if cycles.length === 0}
    <p class="py-8 text-center text-sm text-muted-foreground">
      Velocity appears once a cycle has finished.
    </p>
  {:else}
    <p class="text-xs text-muted-foreground">
      <span class="text-base font-medium tabular-nums text-foreground">
        {Math.round(average * 10) / 10}
      </span>{' '}{noun} per cycle · average of the last {recent.length}
    </p>
    <BarChart
      title="Completed {noun} per cycle"
      seriesLabel="Completed {noun}"
      bars={cycles.map((c) => ({
        label: c.label,
        value: completedOf(c.totals, effective),
        details: [
          { label: 'Cycle', value: c.name },
          { label: 'Scope', value: String(scopeOf(c.totals, effective)) },
        ],
      }))}
      reference={{ label: `Average (last ${recent.length})`, value: average }}
    />
  {/if}
</ChartCard>
