<!-- Compact "12 / 10" for list rows, amber with a warning glyph when over. -->
<script lang="ts">
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

  import { m as msg } from '@/lib/i18n';
  import { cn } from '@/lib/utils';
  import type { CycleCapacity, CycleTotals } from '@/lib/cycle-utils';
  import { amount, measure, unitLabel } from './cycle-capacity';

  let {
    totals,
    capacity,
    estimatesEnabled,
  }: {
    totals: CycleTotals;
    capacity: CycleCapacity;
    estimatesEnabled: boolean;
  } = $props();

  const m = $derived(measure(totals, capacity, estimatesEnabled));
  const text = $derived(`${amount(m.scope)} / ${amount(m.limit)} ${unitLabel(m.unit, m.limit)}`);
</script>

<span
  title={m.over ? msg.shared_capacity_over({ text }) : msg.shared_capacity_scope_vs({ text })}
  class={cn('inline-flex items-center gap-1 tabular-nums', m.over && 'text-amber-600 dark:text-amber-400')}
>
  {#if m.over}<TriangleAlert class="size-3.5" aria-hidden="true" />{/if}
  <span class="sr-only">{m.over ? msg.shared_capacity_over_sr() : msg.shared_capacity_sr()}{' '}</span>
  {amount(m.scope)}/{amount(m.limit)}{m.unit === 'points' ? ` ${msg.projects_cycle_points_short()}` : ''}
</span>
