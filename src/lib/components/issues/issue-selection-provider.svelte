<!-- <IssueSelectionProvider issues={issues}> — see selection.svelte.ts for the API. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import type { IssueRow } from '@/lib/issue-model';
  import { setIssueSelectionContext } from './selection.svelte';

  let {
    issues,
    children,
  }: {
    /** The issues the view currently lists; anything else drops out of the selection. */
    issues: IssueRow[];
    children?: Snippet;
  } = $props();

  setIssueSelectionContext(() => issues);
</script>

{@render children?.()}
