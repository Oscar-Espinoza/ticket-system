<script lang="ts">
  import type { CycleView } from '@/lib/server/mcp/contracts';
  import { burndownGeometry } from './lib/model';

  let { cycle }: { cycle: CycleView } = $props();

  const H = 130;
  // Drawn at the container's real width so strokes and the label keep their size.
  let width = $state(0);
  const geo = $derived(width > 60 ? burndownGeometry(cycle, width, H) : null);
  const last = $derived(cycle.burndown.at(-1));
  const remaining = $derived(last ? Math.max(0, last.totals.scope - last.totals.completed) : cycle.totals.scope - cycle.totals.completed);
  const scope = $derived(last ? last.totals.scope : cycle.totals.scope);
  const summary = $derived(`${remaining} of ${scope} issues remaining`);
</script>

<figure class="m-0">
  <div bind:clientWidth={width}>
    {#if geo}
      <svg width={geo.width} height={geo.height} viewBox="0 0 {geo.width} {geo.height}" class="block" role="img" aria-label="Burndown: {summary}">
        <line x1="6" x2={geo.width - 6} y1={geo.baseline} y2={geo.baseline} stroke="var(--tk-line-2)" stroke-width="1" />
        {#if geo.todayX !== null}
          <line x1={geo.todayX} x2={geo.todayX} y1="6" y2={geo.baseline} stroke="var(--tk-line-2)" stroke-width="1" stroke-dasharray="3 3" />
        {/if}
        <path d={geo.ideal} fill="none" stroke="var(--tk-fg-3)" stroke-width="1.5" stroke-dasharray="4 3" />
        {#if geo.actual}
          <path d={geo.actual} fill="none" stroke="var(--tk-accent)" stroke-width="2" stroke-linejoin="round" />
        {/if}
        <text x={geo.width - 6} y="16" text-anchor="end" fill="var(--tk-fg-3)" font-size="11" font-family="var(--tk-font)">{geo.max} at the start</text>
      </svg>
    {:else if width > 60}
      <p class="text-fg2">No burndown yet: the cycle has no issues.</p>
    {:else}
      <div style:height="{H}px"></div>
    {/if}
  </div>
  <figcaption class="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-fg2">
    <span class="inline-flex items-center gap-1.5"><span class="inline-block h-0.5 w-4 bg-accent"></span>Remaining</span>
    <span class="inline-flex items-center gap-1.5"><span class="inline-block w-4 border-t-2 border-dashed border-fg3"></span>Ideal</span>
    <span class="ml-auto">{summary}</span>
  </figcaption>
</figure>
