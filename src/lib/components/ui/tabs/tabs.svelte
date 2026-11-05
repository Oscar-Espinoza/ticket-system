<script lang="ts">
  import { untrack } from 'svelte';
  import { Tabs as TabsPrimitive } from 'bits-ui';
  import { cn } from '@/lib/utils';

  type Props = TabsPrimitive.RootProps & {
    /** Radix `defaultValue`: initial tab when `value` is not passed. */
    defaultValue?: string;
  };

  let {
    ref = $bindable(null),
    value = $bindable(),
    defaultValue,
    class: className,
    orientation = 'horizontal',
    ...restProps
  }: Props = $props();

  if (value === undefined) value = untrack(() => defaultValue) ?? '';
</script>

<TabsPrimitive.Root
  bind:ref
  bind:value
  {orientation}
  data-slot="tabs"
  data-orientation={orientation}
  class={cn('group/tabs flex gap-2 data-horizontal:flex-col', className)}
  {...restProps}
/>
