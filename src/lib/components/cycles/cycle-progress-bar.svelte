<!-- Stacked completed / started bar. -->
<script lang="ts">
  import { cn } from '@/lib/utils';
  import { percent, type CycleTotals } from '@/lib/cycle-utils';

  let { totals, class: className }: { totals: CycleTotals; class?: string } = $props();

  const done = $derived(percent(totals.completed, totals.scope));
  const started = $derived(percent(totals.started, totals.scope));
</script>

<div
  role="progressbar"
  aria-label="Cycle progress"
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuenow={done}
  aria-valuetext="{done}% completed, {started}% in progress"
  class={cn('flex h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
>
  <span class="h-full bg-primary" style:width="{done}%"></span>
  <span class="h-full bg-amber-500/70" style:width="{started}%"></span>
</div>
