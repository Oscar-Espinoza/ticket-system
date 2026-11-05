<script lang="ts">
  import { Tooltip as TooltipPrimitive, type WithoutChildrenOrChild } from 'bits-ui';
  import type { ComponentProps } from 'svelte';
  import { cn } from '@/lib/utils';

  type Props = TooltipPrimitive.ContentProps & {
    /** Extra classes for the arrow. */
    arrowClasses?: string;
    /** Props for the portal Radix rendered implicitly (e.g. `to`, `disabled`). */
    portalProps?: WithoutChildrenOrChild<ComponentProps<typeof TooltipPrimitive.Portal>>;
  };

  let {
    ref = $bindable(null),
    class: className,
    // Radix defaults: side "top" (bits defaults to "bottom"), sideOffset 0.
    side = 'top',
    sideOffset = 0,
    children,
    arrowClasses,
    portalProps,
    ...restProps
  }: Props = $props();
</script>

<TooltipPrimitive.Portal {...portalProps}>
  <TooltipPrimitive.Content
    bind:ref
    data-slot="tooltip-content"
    {side}
    {sideOffset}
    class={cn(
      'z-50 inline-flex w-fit max-w-xs origin-(--bits-tooltip-content-transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
      className,
    )}
    {...restProps}
  >
    {@render children?.()}
    <!--
      Radix drew an <svg> arrow under a positioned span; bits positions the
      arrow element itself, so the side-specific offsets keep the same look.
    -->
    <TooltipPrimitive.Arrow>
      {#snippet child({ props })}
        <div
          class={cn(
            'z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground data-[side=bottom]:-translate-x-1/2 data-[side=bottom]:-translate-y-[calc(-50%_+_1px)] data-[side=left]:-translate-y-[calc(50%_-_3px)] data-[side=right]:translate-x-[calc(50%_+_2px)] data-[side=right]:translate-y-1/2 data-[side=top]:translate-x-1/2 data-[side=top]:translate-y-[calc(-50%_+_2px)]',
            arrowClasses,
          )}
          {...props}
        ></div>
      {/snippet}
    </TooltipPrimitive.Arrow>
  </TooltipPrimitive.Content>
</TooltipPrimitive.Portal>
