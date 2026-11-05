<!-- <IssueFiltersProvider initial={savedFilters}> — see issue-filters.svelte.ts for the API. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import type { IssueFilters } from '@/lib/issue-filtering';
  import { setIssueFiltersContext } from './issue-filters.svelte.ts';

  let {
    initial,
    children,
  }: {
    /** Saved view filters — used when the URL carries none. */
    initial?: IssueFilters;
    children?: Snippet;
  } = $props();

  setIssueFiltersContext(() => initial);
</script>

{@render children?.()}
