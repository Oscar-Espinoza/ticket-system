<!--
  One dashboard: the owner's own, or one shared into a project the viewer
  belongs to. Widgets compute on the client from the scoped dataset.
-->
<script lang="ts">
  import DashboardView from '@/lib/components/dashboards/dashboard-view.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{data.dashboard.name || 'Dashboard'}</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-7xl flex-col">
  <!-- Next remounted the page per dashboard id; keep that (local widget state is seeded once). -->
  {#key data.dashboard.id}
    <DashboardView
      dashboard={data.dashboard}
      dataset={data.dataset}
      isOwner={data.isOwner}
      canShare={data.canShare}
    />
  {/key}
</div>
