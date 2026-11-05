<!-- Presentational cycle numbers shared by the list and detail pages. -->
<script lang="ts">
  import { cn } from '@/lib/utils';
  import { percent, type CycleTotals } from '@/components/cycles/cycle-utils';

  let {
    totals,
    showPoints,
    class: className,
  }: {
    totals: CycleTotals;
    showPoints: boolean;
    class?: string;
  } = $props();
</script>

{#snippet stat(
  label: string,
  count: number,
  points: number,
  total: number,
  dotClass: string | undefined,
)}
  <div class="flex min-w-24 flex-col gap-0.5">
    <span class="flex items-center gap-1.5 text-xs text-muted-foreground">
      {#if dotClass}<span aria-hidden="true" class={cn('size-2 rounded-full', dotClass)}></span>{/if}
      {label}
    </span>
    <span class="text-sm">
      <span class="font-medium tabular-nums">{count}</span>
      <span class="text-muted-foreground">
        {' '}{count === 1 ? 'issue' : 'issues'}{#if total > 0 && label !== 'Scope'}{` · ${percent(count, total)}%`}{/if}
      </span>
    </span>
    {#if showPoints}
      <span class="text-xs text-muted-foreground tabular-nums">
        {points} {points === 1 ? 'point' : 'points'}
      </span>
    {/if}
  </div>
{/snippet}

<div class={cn('flex flex-wrap gap-x-8 gap-y-3', className)}>
  {@render stat('Scope', totals.scope, totals.scopePoints, totals.scope, 'bg-muted-foreground/40')}
  {@render stat('Started', totals.started, totals.startedPoints, totals.scope, 'bg-amber-500/70')}
  {@render stat('Completed', totals.completed, totals.completedPoints, totals.scope, 'bg-primary')}
</div>
