<!--
  Single-series columns (throughput per week, time distributions): thin bars
  with rounded tops on a shared baseline, 2px gaps, optional average rule,
  per-column hover/focus tooltip.
-->
<script module lang="ts">
  export interface Column {
    /** Axis label (short). */
    label: string;
    /** Tooltip heading; defaults to `label`. */
    title?: string;
    value: number;
  }

  const HEIGHT = 160;
  const M = { top: 10, right: 8, bottom: 22, left: 28 };
  const GAP = 2;

  /** A bar with 4px-rounded top corners anchored on the baseline. */
  function barPath(x: number, y: number, w: number, h: number): string {
    if (h <= 0) return '';
    const r = Math.min(4, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }
</script>

<script lang="ts">
  import ChartTooltip from './chart-tooltip.svelte';
  import { niceMax, useIndexHover } from './chart-kit.svelte.ts';
  import SrTable from './sr-table.svelte';

  let {
    data,
    unit,
    caption,
    showAverage = false,
  }: {
    data: Column[];
    /** "completed", "issues" — tooltip + table wording. */
    unit: string;
    caption: string;
    showAverage?: boolean;
  } = $props();

  let width = $state(0);

  const n = $derived(data.length);
  const plotW = $derived(Math.max(0, width - M.left - M.right));
  const plotH = HEIGHT - M.top - M.bottom;
  const max = $derived(niceMax(Math.max(1, ...data.map((d) => d.value))));
  const slot = $derived(n ? plotW / n : 0);
  const barW = $derived(Math.max(2, Math.min(28, slot - GAP)));
  const x = (i: number) => M.left + i * slot + (slot - barW) / 2;
  const y = (v: number) => M.top + plotH - (v / max) * plotH;
  const indexAt = (px: number) => Math.floor((px - M.left) / Math.max(1, slot));
  const hover = useIndexHover(() => n, indexAt);
  const index = $derived(hover.index);
  const average = $derived(n ? data.reduce((s, d) => s + d.value, 0) / n : 0);
  const labelEvery = $derived(Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 60)))));
</script>

<div bind:clientWidth={width} class="relative">
  {#if width > 0}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <svg
      {width}
      height={HEIGHT}
      role="img"
      aria-label={`${caption}. Use arrow keys to read each column.`}
      class="block rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      {...hover.handlers}
    >
      {#each [0, max / 2, max] as t (t)}
        <g>
          <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} class="stroke-border" />
          <text x={M.left - 6} y={y(t)} dy="0.32em" text-anchor="end" class="fill-muted-foreground text-[10px]">
            {Number.isInteger(t) ? t : t.toFixed(1)}
          </text>
        </g>
      {/each}
      {#each data as d, i (i)}
        <g>
          <path
            d={barPath(x(i), y(d.value), barW, y(0) - y(d.value))}
            class={index === i ? 'fill-primary' : 'fill-primary/80'}
          />
          {#if i % labelEvery === 0 || i === n - 1}
            <text x={x(i) + barW / 2} y={HEIGHT - 6} text-anchor="middle" class="fill-muted-foreground text-[10px]">
              {d.label}
            </text>
          {/if}
        </g>
      {/each}
      {#if showAverage && average > 0}
        <g>
          <line
            x1={M.left}
            x2={M.left + plotW}
            y1={y(average)}
            y2={y(average)}
            stroke-dasharray="3 3"
            class="stroke-muted-foreground"
          />
          <text x={M.left + plotW} y={y(average) - 4} text-anchor="end" class="fill-muted-foreground text-[10px]">
            avg {average.toFixed(1)}
          </text>
        </g>
      {/if}
    </svg>
  {/if}
  {#if index !== null && data[index]}
    <ChartTooltip x={x(index) + barW / 2} {width}>
      <div class="mb-0.5 text-muted-foreground">{data[index].title ?? data[index].label}</div>
      <span class="font-medium tabular-nums">{data[index].value}</span>{' '}
      <span class="text-muted-foreground">{unit}</span>
    </ChartTooltip>
  {/if}
  <SrTable {caption} columns={['', unit]} rows={data.map((d) => [d.title ?? d.label, d.value])} />
</div>
