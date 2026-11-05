<script lang="ts">
  import RoadmapView from '@/lib/components/roadmap/roadmap-view.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Roadmap</title>
</svelte:head>

<RoadmapView epics={data.epics} milestones={data.milestones} dependencies={data.dependencies} />
