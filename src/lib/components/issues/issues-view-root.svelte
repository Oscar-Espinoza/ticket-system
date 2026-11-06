<!--
  Normalizes the saved view's filters once per mount and nests the filter (and,
  for saved views, display) providers.
-->
<script lang="ts">
  import { untrack } from 'svelte';

  import { normalizeIssueFilters } from '@/lib/issue-filtering';
  import DisplayOptionsProvider from './display-options-provider.svelte';
  import IssueFiltersProvider from './issue-filters-provider.svelte';
  import IssuesViewBody from './issues-view-body.svelte';
  import type { IssuesViewProps } from './issues-view.svelte';

  let props: IssuesViewProps = $props();

  // Kept for the life of this mount.
  const initialFilters = untrack(() =>
    props.initialFilters ? normalizeIssueFilters(props.initialFilters) : undefined,
  );
</script>

{#snippet content()}
  <IssueFiltersProvider initial={initialFilters}>
    <IssuesViewBody {...props} {initialFilters} />
  </IssueFiltersProvider>
{/snippet}

{#if props.initialDisplay}
  <DisplayOptionsProvider initial={props.initialDisplay} persist={false}>
    {@render content()}
  </DisplayOptionsProvider>
{:else}
  {@render content()}
{/if}
