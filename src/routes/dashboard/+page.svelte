<script lang="ts">
  import { m } from '@/lib/i18n';
  import CheckCircleIcon from '@lucide/svelte/icons/circle-check-big';
  import CircleOffIcon from '@lucide/svelte/icons/circle-off';

  import DashboardGreeting from '@/lib/components/dashboard-greeting.svelte';
  import ProjectList from '@/lib/components/project-list.svelte';
  import { LabelChip } from '@/lib/components/ui-icons';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.projects_page_title_projects()}</title>
</svelte:head>

<DashboardGreeting name={data.name} />

<div class="mt-4">
  {#if data.githubConnected}
    <LabelChip color="primary" dot={false}>
      <CheckCircleIcon class="size-3 text-primary" />
      {m.projects_github_connected()}
    </LabelChip>
  {:else}
    <LabelChip dot={false}>
      <CircleOffIcon class="size-3" />
      {m.projects_github_not_connected()}
    </LabelChip>
  {/if}
</div>

<ProjectList projects={data.projects} />
