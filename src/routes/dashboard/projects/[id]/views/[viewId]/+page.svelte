<script lang="ts">
  import { m } from '@/lib/i18n';
  import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
  import UsersIcon from '@lucide/svelte/icons/users';

  import FavoriteButton from '@/lib/components/navigation/favorite-button.svelte';
  import SavedViewIssues from '@/lib/components/navigation/saved-view-issues.svelte';
  import type { PageProps } from './$types';

  let { data, params }: PageProps = $props();

  const view = $derived(data.view);
</script>

<svelte:head>
  <title>{view.name}</title>
</svelte:head>

<!-- Keyed on the view so switching views remounts the whole body: the favorite star and the filters / display
     options re-seed from the new view's data. -->
{#key view.id}
<div class="flex min-h-0 flex-1 flex-col">
  <div class="mb-3 flex items-start gap-2">
    <a
      href={`/dashboard/projects/${params.id}/views`}
      aria-label={m.issues_views_all()}
      class="mt-0.5 rounded-md p-0.5 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronLeftIcon class="size-4" />
    </a>
    <div class="min-w-0 flex-1">
      <h2 class="flex items-center gap-2 truncate text-base font-medium">
        {view.name}
        {#if view.shared}
          <span class="flex items-center gap-1 text-xs font-normal text-muted-foreground" title={m.issues_views_shared_title()}>
            <UsersIcon class="size-3.5" />
            {m.issues_views_shared()}
          </span>
        {/if}
      </h2>
      {#if view.description}
        <p class="truncate text-sm text-muted-foreground">{view.description}</p>
      {/if}
      {#if !view.isOwner && view.ownerName}
        <p class="text-xs text-muted-foreground">{m.issues_views_created_by({ name: view.ownerName })}</p>
      {/if}
    </div>
    <FavoriteButton targetType="view" targetId={view.id} initial={data.favorited} />
  </div>

  <SavedViewIssues
    view={{
      id: view.id,
      name: view.name,
      isOwner: view.isOwner,
      shared: view.shared,
      filters: view.filters,
      display: view.display,
    }}
    issues={data.issues}
    defaultView={data.defaultView}
  />
</div>
{/key}
