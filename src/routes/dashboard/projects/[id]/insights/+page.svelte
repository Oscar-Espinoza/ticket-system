<script lang="ts">
  import InsightsView from '@/lib/components/insights/insights-view.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Insights</title>
</svelte:head>

<InsightsView data={data.data} weeks={data.weeks} ranges={data.ranges} labelId={data.labelId} />
