<script lang="ts">
  import { untrack } from 'svelte';
  import { RadioGroup as RadioGroupPrimitive } from 'bits-ui';
  import { cn } from '@/lib/utils';

  type Props = RadioGroupPrimitive.RootProps & {
    /** Radix `defaultValue`: initial value when `value` is not passed. */
    defaultValue?: string;
  };

  let {
    ref = $bindable(null),
    value = $bindable(),
    defaultValue,
    class: className,
    ...restProps
  }: Props = $props();

  if (value === undefined) value = untrack(() => defaultValue) ?? '';
</script>

<RadioGroupPrimitive.Root
  bind:ref
  bind:value
  data-slot="radio-group"
  class={cn('grid w-full gap-2', className)}
  {...restProps}
/>
