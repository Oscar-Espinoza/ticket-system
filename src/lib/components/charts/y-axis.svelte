<!-- Horizontal gridlines + y tick labels (inside an <svg>). -->
<script lang="ts">
  import { CHART_MARGIN } from './chart-frame.svelte.ts';

  let {
    ticks,
    y,
    width,
    format = String,
  }: {
    ticks: number[];
    y: (v: number) => number;
    width: number;
    format?: (v: number) => string;
  } = $props();
</script>

<g aria-hidden="true">
  {#each ticks as tick (tick)}
    <g>
      <line
        x1={CHART_MARGIN.left}
        x2={width - CHART_MARGIN.right}
        y1={y(tick)}
        y2={y(tick)}
        stroke="var(--border)"
        stroke-width={1}
      />
      <text
        x={CHART_MARGIN.left - 6}
        y={y(tick)}
        dy="0.32em"
        text-anchor="end"
        class="fill-muted-foreground text-[10px] tabular-nums"
      >
        {format(tick)}
      </text>
    </g>
  {/each}
</g>
