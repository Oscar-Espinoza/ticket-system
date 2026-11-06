<!-- An @mention inside rendered markdown. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children?: Snippet } = $props();
</script>

<span class="rounded-sm bg-primary/10 px-1 py-px font-medium text-primary">@{@render children?.()}</span>
