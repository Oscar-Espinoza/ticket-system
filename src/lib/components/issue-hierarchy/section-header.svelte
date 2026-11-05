<!-- Section header used by the B4 sections: title, optional meta, actions. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, meta, children }: { title: string; meta?: Snippet; children?: Snippet } = $props();
</script>

<div class="flex min-h-7 items-center gap-2">
  <h3 class="text-xs font-medium text-muted-foreground">{title}</h3>
  {@render meta?.()}
  <div class="ml-auto flex items-center gap-1">{@render children?.()}</div>
</div>
