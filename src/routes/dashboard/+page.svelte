<!-- Port of src/app/dashboard/page.tsx (data from +page.server.ts). -->
<script lang="ts">
  import CheckCircleIcon from '@lucide/svelte/icons/circle-check-big';
  import CircleOffIcon from '@lucide/svelte/icons/circle-off';

  import DashboardGreeting from '@/lib/components/dashboard-greeting.svelte';
  import ProjectList from '@/lib/components/project-list.svelte';
  import { LabelChip } from '@/lib/components/ui-icons';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Projects · Ticket System</title>
</svelte:head>

<DashboardGreeting name={data.name} />

<div class="mt-4">
  {#if data.githubConnected}
    <LabelChip color="primary" dot={false}>
      <CheckCircleIcon class="size-3 text-primary" />
      GitHub connected
    </LabelChip>
  {:else}
    <LabelChip dot={false}>
      <CircleOffIcon class="size-3" />
      GitHub not connected
    </LabelChip>
  {/if}
</div>

<ProjectList projects={data.projects} />
