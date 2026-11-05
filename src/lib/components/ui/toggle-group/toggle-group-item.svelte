<script lang="ts">
  import { ToggleGroup as ToggleGroupPrimitive } from 'bits-ui';
  import { cn } from '@/lib/utils';
  import { toggleVariants, type ToggleVariants } from '@/lib/components/ui/toggle';
  import { getToggleGroupContext } from './toggle-group-context.svelte';

  let {
    ref = $bindable(null),
    class: className,
    variant = 'default',
    size = 'default',
    ...restProps
  }: ToggleGroupPrimitive.ItemProps & ToggleVariants = $props();

  const context = getToggleGroupContext();
  const resolvedVariant = $derived(context.variant || variant);
  const resolvedSize = $derived(context.size || size);
</script>

<ToggleGroupPrimitive.Item
  bind:ref
  data-slot="toggle-group-item"
  data-variant={resolvedVariant}
  data-size={resolvedSize}
  data-spacing={context.spacing}
  class={cn(
    'shrink-0 group-data-[spacing=0]/toggle-group:rounded-none group-data-[spacing=0]/toggle-group:px-2 focus:z-10 focus-visible:z-10 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-end]:pr-1.5 group-data-[spacing=0]/toggle-group:has-data-[icon=inline-start]:pl-1.5 group-data-horizontal/toggle-group:data-[spacing=0]:first:rounded-l-lg group-data-vertical/toggle-group:data-[spacing=0]:first:rounded-t-lg group-data-horizontal/toggle-group:data-[spacing=0]:last:rounded-r-lg group-data-vertical/toggle-group:data-[spacing=0]:last:rounded-b-lg group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:border-l-0 group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:border-t-0 group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-l group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-t',
    toggleVariants({ variant: resolvedVariant, size: resolvedSize }),
    className,
  )}
  {...restProps}
/>
