<script lang="ts">
  import { m } from '@/lib/i18n';
  import LayersIcon from '@lucide/svelte/icons/layers';

  import ViewList from '@/lib/components/navigation/view-list.svelte';
  import { EmptyState } from '@/lib/components/ui-icons';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.issues_views()}</title>
</svelte:head>

{#if data.items.length === 0}
  <EmptyState
    title={m.issues_views_project_empty()}
    description={m.issues_views_project_empty_description()}
  >
    {#snippet icon()}<LayersIcon />{/snippet}
  </EmptyState>
{:else}
  <div class="flex flex-col gap-1">
    <ViewList views={data.items} showProject={false} />
  </div>
{/if}
