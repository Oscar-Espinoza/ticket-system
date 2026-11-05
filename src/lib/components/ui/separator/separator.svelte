<script lang="ts">
  import { Separator as SeparatorPrimitive } from 'bits-ui';
  import { cn } from '@/lib/utils';

  let {
    ref = $bindable(null),
    class: className,
    orientation = 'horizontal',
    // Radix wrapper default; bits defaults to false.
    decorative = true,
    'data-slot': dataSlot = 'separator',
    ...restProps
  }: SeparatorPrimitive.RootProps & { 'data-slot'?: string } = $props();
</script>

<SeparatorPrimitive.Root
  bind:ref
  data-slot={dataSlot}
  {decorative}
  {orientation}
  class={cn(
    'shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch',
    className,
  )}
  {...restProps}
/>
