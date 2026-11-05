<!-- Compact "12 / 10" for list rows, amber with a warning glyph when over. -->
<script lang="ts">
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

  import { cn } from '@/lib/utils';
  import type { CycleCapacity, CycleTotals } from '@/components/cycles/cycle-utils';
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
  title={m.over ? `Over capacity: ${text}` : `Scope vs capacity: ${text}`}
  class={cn('inline-flex items-center gap-1 tabular-nums', m.over && 'text-amber-600 dark:text-amber-400')}
>
  {#if m.over}<TriangleAlert class="size-3.5" aria-hidden="true" />{/if}
  <span class="sr-only">{m.over ? 'Over capacity: ' : 'Capacity: '}</span>
  {amount(m.scope)}/{amount(m.limit)}{m.unit === 'points' ? ' pts' : ''}
</span>
