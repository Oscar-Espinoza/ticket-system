<!-- Legend / tooltip key: a filled box for bars + areas, a short (dashed) stroke for lines. -->
<script module lang="ts">
  export type { SwatchKind } from './chart-frame.svelte.ts';
</script>

<script lang="ts">
  import type { SwatchKind } from './chart-frame.svelte.ts';

  let { color, kind = 'line' }: { color: string; kind?: SwatchKind } = $props();
</script>

{#if kind === 'bar' || kind === 'area'}
  <span aria-hidden="true" class="inline-block size-2.5 shrink-0 rounded-[3px]" style:background={color}></span>
{:else}
  <svg aria-hidden="true" width="14" height="4" class="shrink-0">
    <line
      x1="0"
      y1="2"
      x2="14"
      y2="2"
      stroke={color}
      stroke-width="2"
      stroke-dasharray={kind === 'dashed' ? '3 2' : undefined}
    />
  </svg>
{/if}
