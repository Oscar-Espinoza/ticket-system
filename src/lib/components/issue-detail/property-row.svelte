<!-- One labeled row of the issue properties panel — shared with property slots. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { label, children }: { label: string; children?: Snippet } = $props();
</script>

<div class="flex min-h-8 items-center gap-3">
  <span class="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
  <div class="min-w-0 flex-1">{@render children?.()}</div>
</div>
