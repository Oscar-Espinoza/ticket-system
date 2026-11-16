<script lang="ts">
  import { m } from '@/lib/i18n';
  import LayersIcon from '@lucide/svelte/icons/layers';

  import ViewList from '@/lib/components/navigation/view-list.svelte';
  import { EmptyState } from '@/lib/components/ui-icons';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.issues_views_page_title()}</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-4xl flex-col gap-6">
  <h1 class="text-xl font-medium">{m.issues_views()}</h1>
  {#if data.empty}
    <EmptyState
      title={m.issues_views_empty()}
      description={m.issues_views_empty_description()}
    >
      {#snippet icon()}<LayersIcon />{/snippet}
    </EmptyState>
  {:else}
    {#if data.mine.length > 0}
      <section aria-labelledby="views-mine" class="flex flex-col gap-1">
        <h2 id="views-mine" class="px-2 text-xs font-medium text-muted-foreground">{m.issues_views_yours()}</h2>
        <ViewList views={data.mine} />
      </section>
    {/if}
    {#if data.shared.length > 0}
      <section aria-labelledby="views-shared" class="flex flex-col gap-1">
        <h2 id="views-shared" class="px-2 text-xs font-medium text-muted-foreground">{m.issues_views_shared_with_you()}</h2>
        <ViewList views={data.shared} />
      </section>
    {/if}
  {/if}
</div>
