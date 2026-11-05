<script lang="ts">
  import { Select as SelectPrimitive } from 'bits-ui';
  import { cn } from '@/lib/utils';

  // Radix Select.Label (a group's label) is bits' GroupHeading; like Radix it
  // must sit inside a SelectGroup.
  let { ref = $bindable(null), class: className, ...restProps }: SelectPrimitive.GroupHeadingProps = $props();
</script>

<SelectPrimitive.GroupHeading
  bind:ref
  data-slot="select-label"
  class={cn('px-1.5 py-1 text-xs text-muted-foreground', className)}
  {...restProps}
/>
