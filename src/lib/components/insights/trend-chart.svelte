<!--
  Created vs completed per week: two 2px lines, crosshair + tooltip listing both
  series, legend + direct end labels (identity never by colour alone).
-->
<script module lang="ts">
  const HEIGHT = 200;
  const M = { top: 10, right: 76, bottom: 22, left: 28 };

  // Validated pair (CVD ΔE ≥ 27 light + dark): amber for created, brand for completed.
  const SERIES = [
    { key: 'created', label: 'Created', className: 'text-[#c98500] dark:text-[#b77800]' },
    { key: 'completed', label: 'Completed', className: 'text-status-done' },
  ] as const;
</script>

<script lang="ts">
  import type { WeekPoint } from '@/lib/insights';
  import { formatWeek, niceMax, useIndexHover } from './chart-kit.svelte.ts';
  import ChartTooltip from './chart-tooltip.svelte';
  import SeriesKey from './series-key.svelte';
  import SrTable from './sr-table.svelte';

  let { weeks }: { weeks: WeekPoint[] } = $props();

  let width = $state(0);

  const n = $derived(weeks.length);
  const plotW = $derived(Math.max(0, width - M.left - M.right));
  const plotH = HEIGHT - M.top - M.bottom;
  const max = $derived(niceMax(Math.max(1, ...weeks.flatMap((w) => [w.created, w.completed]))));
  const x = (i: number) => M.left + (n > 1 ? (i * plotW) / (n - 1) : plotW / 2);
  const y = (v: number) => M.top + plotH - (v / max) * plotH;
  const indexAt = (px: number) => Math.round(((px - M.left) / Math.max(1, plotW)) * (n - 1));
  const hover = useIndexHover(() => n, indexAt);
  const index = $derived(hover.index);
  const ticks = $derived([0, max / 2, max]);
  const labelEvery = $derived(Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 70)))));

  // End labels: nudge apart when the two lines finish close together.
  const last = $derived(weeks[n - 1]);
  const endY = $derived.by(() => {
    let ys: number[] = last ? SERIES.map((s) => y(last[s.key])) : [];
    if (ys.length === 2 && Math.abs(ys[0] - ys[1]) < 12) {
      const mid = (ys[0] + ys[1]) / 2;
      const up = ys[0] <= ys[1] ? 0 : 1;
      ys = ys.map((_, i) => (i === up ? mid - 6 : mid + 6));
    }
    return ys;
  });
</script>

<div class="flex flex-col gap-2">
  <div class="flex gap-4 text-xs text-muted-foreground" aria-hidden="true">
    {#each SERIES as s (s.key)}
      <span class="inline-flex items-center gap-1.5">
        <SeriesKey class={s.className} />
        {s.label}
      </span>
    {/each}
  </div>
  <div bind:clientWidth={width} class="relative">
    {#if width > 0}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <svg
        {width}
        height={HEIGHT}
        role="img"
        aria-label={`Issues created and completed per week over the last ${n} weeks. Use arrow keys to read each week.`}
        class="block overflow-visible rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        {...hover.handlers}
      >
        {#each ticks as t (t)}
          <g>
            <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} class="stroke-border" />
            <text x={M.left - 6} y={y(t)} dy="0.32em" text-anchor="end" class="fill-muted-foreground text-[10px]">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        {/each}
        {#each weeks as w, i (w.week)}
          {#if i % labelEvery === 0 || i === n - 1}
            <text
              x={x(i)}
              y={HEIGHT - 6}
              text-anchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
              class="fill-muted-foreground text-[10px]"
            >
              {formatWeek(w.week)}
            </text>
          {/if}
        {/each}
        {#if index !== null}
          <line x1={x(index)} x2={x(index)} y1={M.top} y2={M.top + plotH} class="stroke-muted-foreground/50" />
        {/if}
        {#each SERIES as s, si (s.key)}
          <g class={s.className}>
            <polyline
              fill="none"
              stroke="currentColor"
              stroke-width={2}
              stroke-linejoin="round"
              stroke-linecap="round"
              points={weeks.map((w, i) => `${x(i)},${y(w[s.key])}`).join(' ')}
            />
            {#if index !== null && weeks[index]}
              <circle
                cx={x(index)}
                cy={y(weeks[index][s.key])}
                r={4}
                fill="currentColor"
                class="stroke-background"
                stroke-width={2}
              />
            {/if}
            {#if last}
              <text x={x(n - 1) + 8} y={endY[si]} dy="0.32em" class="fill-muted-foreground text-[11px]">
                {s.label}
                {last[s.key]}
              </text>
            {/if}
          </g>
        {/each}
      </svg>
    {/if}
    {#if index !== null && weeks[index]}
      <ChartTooltip x={x(index)} {width}>
        <div class="mb-1 text-muted-foreground">Week of {formatWeek(weeks[index].week)}</div>
        {#each SERIES as s (s.key)}
          <div class="flex items-center gap-2">
            <SeriesKey class={s.className} />
            <span class="font-medium tabular-nums">{weeks[index][s.key]}</span>
            <span class="text-muted-foreground">{s.label.toLowerCase()}</span>
          </div>
        {/each}
      </ChartTooltip>
    {/if}
  </div>
  <SrTable
    caption="Issues created and completed per week"
    columns={['Week of', 'Created', 'Completed']}
    rows={weeks.map((w) => [formatWeek(w.week), w.created, w.completed])}
  />
</div>
