<script lang="ts">
  import { ToggleGroup, ToggleGroupItem } from '@/lib/components/ui/toggle-group';
  import type { ChartUnit } from '@/lib/components/cycles/cycle-utils';

  let {
    value,
    onChange,
  }: {
    value: ChartUnit;
    onChange: (unit: ChartUnit) => void;
  } = $props();
</script>

<!-- Strictly controlled like React: re-clicking the pressed item ("" from bits) is ignored. -->
<ToggleGroup
  type="single"
  size="sm"
  spacing={0}
  bind:value={() => value, (next) => next && onChange(next as ChartUnit)}
  aria-label="Chart unit"
>
  <ToggleGroupItem value="issues" class="h-6 px-2 text-xs">Issues</ToggleGroupItem>
  <ToggleGroupItem value="points" class="h-6 px-2 text-xs">Points</ToggleGroupItem>
</ToggleGroup>
