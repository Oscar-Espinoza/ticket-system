<!--
  Minimal SVG line / area chart: one shared y axis, series drawn in order (a
  null value ends the line — e.g. "remaining" stops at today), crosshair +
  tooltip on hover or ←/→ focus, legend, and a hidden data table.
-->
<script module lang="ts">
  export interface LineSeries {
    id: string;
    label: string;
    /** One per x label; null = no value (gap / not yet). */
    values: (number | null)[];
    /** Any CSS color, e.g. `var(--primary)`. */
    color: string;
    variant?: 'line' | 'area' | 'dashed';
  }

  export interface LineChartProps {
    /** Accessible name of the chart. */
    title: string;
    /** Axis tick label per x position. */
    labels: string[];
    /** Longer tooltip / table label per x position (default: `labels`). */
    pointLabels?: string[];
    series: LineSeries[];
    height?: number;
    formatValue?: (value: number) => string;
    class?: string;
  }
</script>

<script lang="ts">
  import { cn } from '@/lib/utils';
  import { CHART_MARGIN as M, niceScale, tickIndexes, useActiveIndex } from './chart-frame.svelte.ts';
  import ChartLegend from './chart-legend.svelte';
  import ChartTable from './chart-table.svelte';
  import ChartTooltip from './chart-tooltip.svelte';
  import YAxis from './y-axis.svelte';

  let {
    title,
    labels,
    pointLabels: pointLabelsProp,
    series,
    height = 180,
    formatValue = (v: number) => String(Math.round(v * 10) / 10),
    class: className,
  }: LineChartProps = $props();

  const pointLabels = $derived(pointLabelsProp ?? labels);

  // Width of the wrapper (0 until measured — render nothing before that).
  let width = $state(0);
  const tableId = $props.id();
  const count = $derived(labels.length);

  const maxValue = $derived(Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0))));
  const scale = $derived(niceScale(maxValue));
  const plotW = $derived(Math.max(1, width - M.left - M.right));
  const plotH = $derived(height - M.top - M.bottom);
  const x = (i: number) => M.left + (count <= 1 ? plotW / 2 : (i / (count - 1)) * plotW);
  const y = (v: number) => M.top + plotH - (v / scale.max) * plotH;
  const indexAt = (px: number) =>
    count <= 1 ? 0 : Math.min(count - 1, Math.max(0, Math.round(((px - M.left) / plotW) * (count - 1))));
  const hover = useActiveIndex(() => count, indexAt);
  const active = $derived(hover.active);

  const segments = (values: (number | null)[]) => {
    const runs: [number, number][][] = [];
    let run: [number, number][] = [];
    values.forEach((v, i) => {
      if (v === null) {
        if (run.length) runs.push(run);
        run = [];
      } else run.push([x(i), y(v)]);
    });
    if (run.length) runs.push(run);
    return runs;
  };
  const path = (run: [number, number][]) =>
    run.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('');

  const tooltipRows = $derived.by(() => {
    if (active === null) return [];
    return series.flatMap((s) => {
      const v = s.values[active];
      return v === null || v === undefined
        ? []
        : [
            {
              label: s.label,
              value: formatValue(v),
              swatch: { color: s.color, kind: s.variant === 'dashed' ? ('dashed' as const) : ('line' as const) },
            },
          ];
    });
  });
</script>

<figure class={cn('flex flex-col gap-2', className)}>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    bind:clientWidth={width}
    class="relative w-full outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring/50"
    style:height="{height}px"
    tabindex={count > 0 ? 0 : undefined}
    role="group"
    aria-label={`${title}. Use the arrow keys to read values.`}
    aria-describedby={tableId}
    onkeydown={hover.onkeydown}
    onblur={hover.onblur}
  >
    {#if width > 0}
      <svg {width} {height} aria-hidden="true" class="block overflow-visible">
        <YAxis ticks={scale.ticks} {y} {width} format={formatValue} />
        {#each tickIndexes(count) as i (i)}
          <text
            x={x(i)}
            y={height - 6}
            text-anchor={i === 0 ? 'start' : i === count - 1 ? 'end' : 'middle'}
            class="fill-muted-foreground text-[10px]"
          >
            {labels[i]}
          </text>
        {/each}
        {#each series as s (s.id)}
          {#each segments(s.values) as run, r (r)}
            <g>
              {#if s.variant === 'area' && run.length > 1}
                <path
                  d={`${path(run)}L${run[run.length - 1][0]},${y(0)}L${run[0][0]},${y(0)}Z`}
                  fill={s.color}
                  opacity={0.12}
                />
              {/if}
              <path
                d={path(run)}
                fill="none"
                stroke={s.color}
                stroke-width={s.variant === 'area' ? 2 : 1.5}
                stroke-dasharray={s.variant === 'dashed' ? '4 3' : undefined}
                stroke-linejoin="round"
                stroke-linecap="round"
              />
            </g>
          {/each}
        {/each}
        {#if active !== null}
          <g>
            <line
              x1={x(active)}
              x2={x(active)}
              y1={M.top}
              y2={M.top + plotH}
              stroke="var(--muted-foreground)"
              stroke-opacity={0.5}
            />
            {#each series as s (s.id)}
              {@const v = s.values[active]}
              {#if v !== null && v !== undefined}
                <circle cx={x(active)} cy={y(v)} r={4} fill={s.color} stroke="var(--background)" stroke-width={2} />
              {/if}
            {/each}
          </g>
        {/if}
        <!-- Hit area larger than the marks. -->
        <rect
          x={0}
          y={0}
          {width}
          {height}
          fill="transparent"
          role="presentation"
          onpointermove={hover.onpointermove}
          onpointerleave={hover.onpointerleave}
        />
      </svg>
    {/if}
    {#if active !== null && width > 0}
      <ChartTooltip x={x(active)} {width} title={pointLabels[active]} rows={tooltipRows} />
    {/if}
  </div>
  {#if series.length > 1}
    <ChartLegend
      items={series.map((s) => ({
        label: s.label,
        color: s.color,
        kind: s.variant === 'dashed' ? 'dashed' : 'line',
      }))}
    />
  {/if}
  <ChartTable
    id={tableId}
    caption={title}
    columns={['', ...series.map((s) => s.label)]}
    rows={pointLabels.map((label, i) => [
      label,
      ...series.map((s) => (s.values[i] === null ? '—' : formatValue(s.values[i] as number))),
    ])}
  />
</figure>
