<!-- Presentational cycle numbers shared by the list and detail pages. -->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import { cn } from '@/lib/utils';
  import { percent, type CycleTotals } from '@/lib/cycle-utils';

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
  isScope: boolean,
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
        {' '}{m.shared_issue_noun({ count })}{#if total > 0 && !isScope}{` · ${percent(count, total)}%`}{/if}
      </span>
    </span>
    {#if showPoints}
      <span class="text-xs text-muted-foreground tabular-nums">
        {m.shared_point_count({ count: points })}
      </span>
    {/if}
  </div>
{/snippet}

<div class={cn('flex flex-wrap gap-x-8 gap-y-3', className)}>
  {@render stat(m.shared_cycle_scope(), true, totals.scope, totals.scopePoints, totals.scope, 'bg-muted-foreground/40')}
  {@render stat(m.shared_cycle_started(), false, totals.started, totals.startedPoints, totals.scope, 'bg-amber-500/70')}
  {@render stat(m.shared_cycle_completed(), false, totals.completed, totals.completedPoints, totals.scope, 'bg-primary')}
</div>
