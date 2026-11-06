<!-- Card frame shared by the burndown and velocity charts. -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  import type { ChartUnit } from '@/lib/cycle-utils';
  import UnitToggle from './unit-toggle.svelte';

  let {
    title,
    unit,
    onUnit,
    showUnit,
    children,
  }: {
    title: string;
    unit: ChartUnit;
    onUnit: (unit: ChartUnit) => void;
    showUnit: boolean;
    children?: Snippet;
  } = $props();
</script>

<section class="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-4">
  <div class="flex items-center gap-2">
    <h2 class="text-sm font-medium">{title}</h2>
    {#if showUnit}
      <div class="ml-auto">
        <UnitToggle value={unit} onChange={onUnit} />
      </div>
    {/if}
  </div>
  {@render children?.()}
</section>
