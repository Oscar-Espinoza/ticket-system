<script lang="ts">
  import IssuesView from '@/lib/components/issues/issues-view.svelte';
  import BurndownChart from '@/lib/components/cycles/burndown-chart.svelte';
  import CapacityMeter from '@/lib/components/cycles/capacity-meter.svelte';
  import CycleBreakdown from '@/lib/components/cycles/cycle-breakdown.svelte';
  import CycleHeader from '@/lib/components/cycles/cycle-header.svelte';
  import CycleProgressBar from '@/lib/components/cycles/cycle-progress-bar.svelte';
  import CycleStats from '@/lib/components/cycles/cycle-stats.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head><title>{data.title}</title></svelte:head>

<div class="flex min-h-0 flex-1 flex-col gap-5">
  <CycleHeader
    projectId={data.projectId}
    cycle={data.cycle}
    status={data.status}
    progress={data.progress}
    unfinished={data.unfinished}
    nextCycleName={data.nextCycleName}
    canWrite={data.canWrite}
  />

  <div class="flex flex-col gap-3">
    <CycleProgressBar totals={data.totals} class="max-w-xl" />
    <CycleStats totals={data.totals} showPoints={data.estimatesEnabled} />
    {#if data.capacity}
      <CapacityMeter
        totals={data.totals}
        capacity={data.capacity}
        estimatesEnabled={data.estimatesEnabled}
        class="max-w-xl"
      />
    {/if}
  </div>

  <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
    <BurndownChart
      cycle={{ startsAt: data.cycle.startsAt, endsAt: data.cycle.endsAt }}
      points={data.burndown}
      estimatesEnabled={data.estimatesEnabled}
    />
    <CycleBreakdown issues={data.issues} estimatesEnabled={data.estimatesEnabled} />
  </div>

  <IssuesView
    issues={data.issues}
    defaultView={data.defaultView}
    createDefaults={{ cycleId: data.cycle.id }}
  />
</div>
