<!-- A project's saved views (port of src/app/dashboard/projects/[id]/views/page.tsx). -->
<script lang="ts">
  import LayersIcon from '@lucide/svelte/icons/layers';

  import ViewList from '@/lib/components/navigation/view-list.svelte';
  import { EmptyState } from '@/lib/components/ui-icons';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Views · Ticket System</title>
</svelte:head>

{#if data.items.length === 0}
  <EmptyState
    title="No views in this project"
    description="Filter and arrange the issue list, then choose “Save view” in the toolbar. Shared views appear here for everyone in the project."
  >
    {#snippet icon()}<LayersIcon />{/snippet}
  </EmptyState>
{:else}
  <div class="flex flex-col gap-1">
    <ViewList views={data.items} showProject={false} />
  </div>
{/if}
