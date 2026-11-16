<script lang="ts">
  import { m } from '@/lib/i18n';
  import RoadmapView from '@/lib/components/roadmap/roadmap-view.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.projects_tab_roadmap()}</title>
</svelte:head>

<RoadmapView epics={data.epics} milestones={data.milestones} dependencies={data.dependencies} />
