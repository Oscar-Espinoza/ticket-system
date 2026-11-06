<!--
  Project frame: project
  data + display options for every page below, live updates, the header
  (name, key chip, favorite star) and the project tabs. Data and the
  membership check come from +layout.server.ts.
-->
<script lang="ts">
  import ProjectLoading from '@/lib/components/app-shell/project-loading.svelte';
  import { useNavigationLoading } from '@/lib/components/app-shell/navigation-loading.svelte';
  import DisplayOptionsProvider from '@/lib/components/issues/display-options-provider.svelte';
  import FavoriteButton from '@/lib/components/navigation/favorite-button.svelte';
  import ProjectDataProvider from '@/lib/components/project/project-data-provider.svelte';
  import ProjectTabs from '@/lib/components/project/project-tabs.svelte';
  import LiveUpdates from '@/lib/components/project/slots/live-updates.svelte';
  import { LabelChip } from '@/lib/components/ui-icons';
  import type { LayoutProps } from './$types';

  let { data, children }: LayoutProps = $props();

  const project = $derived(data.projectData.project);
  const loading = useNavigationLoading();
</script>

<svelte:head>
  <!-- generateMetadata: pages below override it with their own title. -->
  <title>{project.name} · Ticket System</title>
</svelte:head>

<!-- Remount per project (state, providers, star). -->
{#key project.id}
  <ProjectDataProvider value={data.projectData}>
    <DisplayOptionsProvider>
      <LiveUpdates projectId={project.id} />
      <div class="flex min-h-full flex-col">
        <div class="mb-3 flex items-center gap-3">
          <h1 class="truncate text-xl font-medium">{project.name}</h1>
          <LabelChip dot={false} class="font-mono">
            {project.ticketKey}
          </LabelChip>
          <FavoriteButton targetType="project" targetId={project.id} class="-ml-1" />
        </div>
        <ProjectTabs projectId={project.id} />
        {#if loading.project}
          <ProjectLoading />
        {/if}
        <!-- Kept mounted (hidden) while the skeleton shows, so a cancelled navigation loses nothing. -->
        <div class={loading.project ? 'hidden' : 'contents'}>
          {@render children()}
        </div>
      </div>
    </DisplayOptionsProvider>
  </ProjectDataProvider>
{/key}
