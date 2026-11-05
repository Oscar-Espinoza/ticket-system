<!--
  Minimal SVG bar chart: one series of vertical bars (4px rounded tops anchored
  to the baseline), an optional dashed reference line (e.g. an average), hover /
  ←→ tooltip per bar, and a hidden data table.
-->
<script module lang="ts">
  export interface BarDatum {
    label: string;
    value: number;
    /** Extra tooltip rows, e.g. "Scope: 12". */
    details?: { label: string; value: string }[];
  }

  export interface BarChartProps {
    title: string;
    /** Series name (tooltip + legend). */
    seriesLabel: string;
    bars: BarDatum[];
    color?: string;
    reference?: { label: string; value: number; color?: string };
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
    seriesLabel,
    bars,
    color = 'var(--primary)',
    reference,
    height = 160,
    formatValue = (v: number) => String(Math.round(v * 10) / 10),
    class: className,
  }: BarChartProps = $props();

  // Width of the wrapper (0 until measured — render nothing before that).
  let width = $state(0);
  const tableId = $props.id();

  const count = $derived(bars.length);
  const refColor = $derived(reference?.color ?? 'var(--muted-foreground)');

  const scale = $derived(niceScale(Math.max(0, reference?.value ?? 0, ...bars.map((b) => b.value))));
  const plotW = $derived(Math.max(1, width - M.left - M.right));
  const plotH = $derived(height - M.top - M.bottom);
  const band = $derived(plotW / Math.max(1, count));
  const barW = $derived(Math.max(4, Math.min(40, band * 0.6)));
  const cx = (i: number) => M.left + band * (i + 0.5);
  const y = (v: number) => M.top + plotH - (v / scale.max) * plotH;
  const indexAt = (px: number) => Math.min(count - 1, Math.max(0, Math.floor((px - M.left) / band)));
  const hover = useActiveIndex(() => count, indexAt);
  const active = $derived(hover.active);

  const barPath = (i: number, v: number) => {
    const x0 = cx(i) - barW / 2;
    const top = y(v);
    const base = y(0);
    const r = Math.min(4, barW / 2, base - top);
    if (base - top < 0.5) return '';
    return `M${x0},${base}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + barW - r}Q${x0 + barW},${top} ${x0 + barW},${top + r}V${base}Z`;
  };

  const tooltipRows = $derived.by(() => {
    if (active === null || !bars[active]) return [];
    const bar = bars[active];
    return [
      { label: seriesLabel, value: formatValue(bar.value), swatch: { color, kind: 'bar' as const } },
      ...(bar.details ?? []),
      ...(reference
        ? [
            {
              label: reference.label,
              value: formatValue(reference.value),
              swatch: { color: refColor, kind: 'dashed' as const },
            },
          ]
        : []),
    ];
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
        {#each tickIndexes(count, 8) as i (i)}
          <text x={cx(i)} y={height - 6} text-anchor="middle" class="fill-muted-foreground text-[10px]">
            {bars[i].label}
          </text>
        {/each}
        {#each bars as bar, i (i)}
          <path d={barPath(i, bar.value)} fill={color} opacity={active === null || active === i ? 1 : 0.55} />
        {/each}
        {#if reference}
          <line
            x1={M.left}
            x2={width - M.right}
            y1={y(reference.value)}
            y2={y(reference.value)}
            stroke={refColor}
            stroke-width={1.5}
            stroke-dasharray="4 3"
          />
        {/if}
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
    {#if active !== null && width > 0 && bars[active]}
      <ChartTooltip x={cx(active)} {width} title={bars[active].label} rows={tooltipRows} />
    {/if}
  </div>
  {#if reference}
    <ChartLegend
      items={[
        { label: seriesLabel, color, kind: 'bar' },
        { label: reference.label, color: refColor, kind: 'dashed' },
      ]}
    />
  {/if}
  <ChartTable
    id={tableId}
    caption={title}
    columns={['', seriesLabel, ...(bars[0]?.details?.map((d) => d.label) ?? [])]}
    rows={bars.map((bar) => [
      bar.label,
      formatValue(bar.value),
      ...(bar.details?.map((d) => d.value) ?? []),
    ])}
  />
</figure>
