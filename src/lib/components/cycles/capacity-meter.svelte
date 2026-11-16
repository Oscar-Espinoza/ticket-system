<!-- Scope vs capacity (average completed work of the last cycles): full block for the cycle page. -->
<script lang="ts">
  import { m } from '@/lib/i18n';
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

  const cap = $derived(measure(totals, capacity, estimatesEnabled));
  const max = $derived(Math.max(cap.scope, cap.limit, 1));
  const fewer = $derived(capacity.sample < CAPACITY_CYCLES);
  const averageText = $derived(
    capacity.sample === 1
      ? (fewer ? m.projects_capacity_average_few_one : m.projects_capacity_average_one)({ unit: cap.unit === 'points' ? m.projects_unit_points_name() : m.projects_unit_issues_name() })
      : (fewer ? m.projects_capacity_average_few_many : m.projects_capacity_average_many)({ unit: cap.unit === 'points' ? m.projects_unit_points_name() : m.projects_unit_issues_name(), count: capacity.sample }),
  );
</script>

<section aria-label={m.projects_capacity()} class={cn('flex flex-col gap-1.5', className)}>
  <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
    <span class="text-muted-foreground">{m.projects_capacity()}</span>
    <span class="tabular-nums">
      <span class="font-medium">{amount(cap.scope)}</span>
      <span class="text-muted-foreground">
        {' '}/ {amount(cap.limit)} {unitLabel(cap.unit, cap.limit)}
      </span>
    </span>
    {#if cap.over}
      <span class="flex items-center gap-1 text-amber-600 dark:text-amber-400">
        <TriangleAlert class="size-3.5" aria-hidden="true" />
        {m.projects_capacity_over({ amount: amount(Math.round((cap.scope - cap.limit) * 10) / 10) })}
      </span>
    {/if}
  </div>
  <div
    role="meter"
    aria-label={m.projects_capacity_scope_vs()}
    aria-valuemin={0}
    aria-valuemax={max}
    aria-valuenow={cap.scope}
    aria-valuetext={m.projects_capacity_valuetext({ scope: amount(cap.scope), limit: amount(cap.limit), unit: unitLabel(cap.unit, cap.limit) })}
    class="relative h-1.5 w-full overflow-hidden rounded-full bg-muted"
  >
    <span
      class={cn('absolute inset-y-0 left-0', cap.over ? 'bg-amber-500/80' : 'bg-muted-foreground/40')}
      style:width="{(cap.scope / max) * 100}%"
    ></span>
    <span
      aria-hidden="true"
      class="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-foreground/70"
      style:left="{(cap.limit / max) * 100}%"
    ></span>
  </div>
  <p class="text-xs text-muted-foreground">
    {averageText}
  </p>
</section>
