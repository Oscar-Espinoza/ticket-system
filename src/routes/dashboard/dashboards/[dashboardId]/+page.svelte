<!--
  One dashboard: the owner's own, or one shared into a project the viewer
  belongs to. Widgets compute on the client from the scoped dataset.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import DashboardView from '@/lib/components/dashboards/dashboard-view.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.editor_shell_page_title({ page: data.dashboard.name ?? m.editor_noun_dashboard() })}</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-7xl flex-col">
  <!-- Remount per dashboard id (local widget state is seeded once). -->
  {#key data.dashboard.id}
    <DashboardView
      dashboard={data.dashboard}
      dataset={data.dataset}
      isOwner={data.isOwner}
      canShare={data.canShare}
    />
  {/key}
</div>
