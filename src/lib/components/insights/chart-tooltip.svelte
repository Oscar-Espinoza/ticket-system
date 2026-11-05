<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    x,
    width,
    children,
  }: {
    x: number;
    /** Chart width — flips the box to the left of the pointer near the right edge. */
    width: number;
    children?: Snippet;
  } = $props();

  const flip = $derived(x > width - 160);
</script>

<div
  role="presentation"
  class="pointer-events-none absolute top-1 z-10 min-w-28 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-[var(--shadow-popover)]"
  style:right={flip ? `${width - x + 10}px` : undefined}
  style:left={flip ? undefined : `${x + 10}px`}
>
  {@render children?.()}
</div>
