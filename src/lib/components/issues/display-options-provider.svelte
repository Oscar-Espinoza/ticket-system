<!--
  <DisplayOptionsProvider initial={…} persist={…}> — see display-options.svelte.ts.
  Without `initial` inside a project: persisted per project (localStorage).
  With `initial` (saved views) or outside a project: plain component state.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import { setDisplayOptionsContext, type DisplayOptionsProviderProps } from './display-options.svelte';

  let { initial, persist, children }: DisplayOptionsProviderProps & { children?: Snippet } = $props();

  setDisplayOptionsContext(() => ({ initial, persist }));
</script>

{@render children?.()}
