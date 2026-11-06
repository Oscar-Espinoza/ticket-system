<!--
  Hover / focus tooltip of the SVG charts. `rows[].swatch` is `{ color, kind? }` (rendered with <Swatch>).
-->
<script module lang="ts">
  import type { Snippet } from 'svelte';

  import type { SwatchKind } from './chart-frame.svelte.ts';

  export interface ChartTooltipRow {
    label: string;
    value: string;
    swatch?: { color: string; kind?: SwatchKind };
  }

  export interface ChartTooltipProps {
    /** Anchor x within the chart, px. */
    x: number;
    width: number;
    /** A string, or pass a `title` snippet for rich content. */
    title: string | Snippet;
    rows: ChartTooltipRow[];
  }
</script>

<script lang="ts">
  import Swatch from './swatch.svelte';

  let { x, width, title, rows }: ChartTooltipProps = $props();

  // Flip to the anchor's left in the right half so it never overflows.
  const right = $derived(x > width / 2);
</script>

<div
  role="presentation"
  class="pointer-events-none absolute top-1 z-10 min-w-32 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md"
  style:right={right ? `${width - x + 10}px` : undefined}
  style:left={right ? undefined : `${x + 10}px`}
>
  <p class="mb-1 font-medium">
    {#if typeof title === 'string'}{title}{:else}{@render title()}{/if}
  </p>
  {#each rows as row (row.label)}
    <p class="flex items-center gap-2">
      {#if row.swatch}<Swatch color={row.swatch.color} kind={row.swatch.kind} />{/if}
      <span class="text-muted-foreground">{row.label}</span>
      <span class="ml-auto pl-3 font-medium tabular-nums">{row.value}</span>
    </p>
  {/each}
</div>
