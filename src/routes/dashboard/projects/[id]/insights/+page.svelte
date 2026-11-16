<script lang="ts">
  import { m } from '@/lib/i18n';
  import InsightsView from '@/lib/components/insights/insights-view.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.editor_nav_insights()}</title>
</svelte:head>

<InsightsView data={data.data} weeks={data.weeks} ranges={data.ranges} labelId={data.labelId} />
