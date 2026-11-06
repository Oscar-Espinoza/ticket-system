<!-- Scope vs capacity (average completed work of the last cycles): full block for the cycle page. -->
<script lang="ts">
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

  import { cn } from '@/lib/utils';
  import { CAPACITY_CYCLES, type CycleCapacity, type CycleTotals } from '@/lib/cycle-utils';
  import { amount, measure, unitLabel } from './cycle-capacity';

  let {
    totals,
    capacity,
    estimatesEnabled,
    class: className,
  }: {
    totals: CycleTotals;
    capacity: CycleCapacity;
    estimatesEnabled: boolean;
    class?: string;
  } = $props();

  const m = $derived(measure(totals, capacity, estimatesEnabled));
  const max = $derived(Math.max(m.scope, m.limit, 1));
  const cycles = $derived(
    capacity.sample === 1 ? 'the last cycle' : `the last ${capacity.sample} cycles`,
  );
</script>

<section aria-label="Capacity" class={cn('flex flex-col gap-1.5', className)}>
  <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
    <span class="text-muted-foreground">Capacity</span>
    <span class="tabular-nums">
      <span class="font-medium">{amount(m.scope)}</span>
      <span class="text-muted-foreground">
        {' '}/ {amount(m.limit)} {unitLabel(m.unit, m.limit)}
      </span>
    </span>
    {#if m.over}
      <span class="flex items-center gap-1 text-amber-600 dark:text-amber-400">
        <TriangleAlert class="size-3.5" aria-hidden="true" />
        Over capacity by {amount(Math.round((m.scope - m.limit) * 10) / 10)}
      </span>
    {/if}
  </div>
  <div
    role="meter"
    aria-label="Scope compared with capacity"
    aria-valuemin={0}
    aria-valuemax={max}
    aria-valuenow={m.scope}
    aria-valuetext="{amount(m.scope)} of {amount(m.limit)} {unitLabel(m.unit, m.limit)}"
    class="relative h-1.5 w-full overflow-hidden rounded-full bg-muted"
  >
    <span
      class={cn('absolute inset-y-0 left-0', m.over ? 'bg-amber-500/80' : 'bg-muted-foreground/40')}
      style:width="{(m.scope / max) * 100}%"
    ></span>
    <span
      aria-hidden="true"
      class="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-foreground/70"
      style:left="{(m.limit / max) * 100}%"
    ></span>
  </div>
  <p class="text-xs text-muted-foreground">
    Average {m.unit} completed in {cycles}{#if capacity.sample < CAPACITY_CYCLES}{' (fewer than 3 past cycles)'}{/if}.
  </p>
</section>
