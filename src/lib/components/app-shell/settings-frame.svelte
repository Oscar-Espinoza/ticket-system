<!-- Two-column settings frame: nav on the left, a readable column of content.
     Port of SettingsFrame in src/components/app-shell/settings-nav.tsx. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { nav, children }: { nav: Snippet; children?: Snippet } = $props();
</script>

<div class="flex flex-col gap-6 md:flex-row md:gap-10">
  {@render nav()}
  <div class="min-w-0 max-w-2xl flex-1">{@render children?.()}</div>
</div>
