<script lang="ts">
  import { m } from '@/lib/i18n';
  import EpicsList from '@/lib/components/epics/epics-list.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.projects_epics()}</title>
</svelte:head>

<EpicsList epics={data.epics} labels={data.labels} />
