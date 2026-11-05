<script lang="ts">
  import { Dialog as SheetPrimitive, type WithoutChild } from 'bits-ui';
  import { cn } from '@/lib/utils';

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithoutChild<SheetPrimitive.TitleProps> = $props();
</script>

<SheetPrimitive.Title
  bind:ref
  data-slot="sheet-title"
  class={cn('font-heading text-base font-medium text-foreground', className)}
  {...restProps}
>
  <!-- Radix Dialog.Title renders an <h2> (bits: a div with role="heading"). -->
  {#snippet child({ props })}
    <h2 {...props}>{@render children?.()}</h2>
  {/snippet}
</SheetPrimitive.Title>
