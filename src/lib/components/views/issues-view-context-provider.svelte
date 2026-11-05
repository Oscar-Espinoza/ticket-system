<!-- <IssuesViewContextProvider value={{ subIssues, savedView }}> — see view-context.svelte.ts. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import { setIssuesViewContext, type IssuesViewContextValue } from './view-context.svelte';

  let { value, children }: { value: IssuesViewContextValue; children?: Snippet } = $props();

  setIssuesViewContext(() => value);
</script>

{@render children?.()}
