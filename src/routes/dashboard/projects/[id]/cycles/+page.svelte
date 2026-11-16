<script lang="ts">
  import { m } from '@/lib/i18n';
  import IterationCw from '@lucide/svelte/icons/iteration-cw';

  import CyclesList from '@/lib/components/cycles/cycles-list.svelte';
  import FeatureOffState from '@/lib/components/cycles/feature-off.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head><title>{m.projects_cycles()}</title></svelte:head>

{#snippet icon()}<IterationCw />{/snippet}

{#if data.featureOff}
  <FeatureOffState
    projectId={data.projectId}
    {icon}
    title={m.projects_cycles_off_title()}
    description={m.projects_cycles_off_desc()}
    canEnable={data.canEnable}
  />
{:else}
  <CyclesList
    projectId={data.projectId}
    current={data.current}
    upcoming={data.upcoming}
    past={data.past}
    velocity={data.velocity}
    capacity={data.capacity}
    cooldownWeeks={data.cooldownWeeks}
    estimatesEnabled={data.estimatesEnabled}
    canWrite={data.canWrite}
    suggested={data.suggested}
  />
{/if}
