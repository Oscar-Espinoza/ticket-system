<!-- <SavedViewProvider view={view}> — see saved-view-context.svelte.ts for the API. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import { setSavedViewContext, type OpenSavedView } from './saved-view-context.svelte';

  let { view, children }: { view: OpenSavedView; children?: Snippet } = $props();

  setSavedViewContext(() => view);
</script>

{@render children?.()}
