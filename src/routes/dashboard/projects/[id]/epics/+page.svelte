<script lang="ts">
  import EpicsList from '@/lib/components/epics/epics-list.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Epics</title>
</svelte:head>

<EpicsList epics={data.epics} labels={data.labels} />
