<script lang="ts">
  import { Select as SelectPrimitive, type WithoutChild, type WithoutChildrenOrChild } from 'bits-ui';
  import type { ComponentProps } from 'svelte';
  import { cn } from '@/lib/utils';
  import SelectScrollDownButton from './select-scroll-down-button.svelte';
  import SelectScrollUpButton from './select-scroll-up-button.svelte';

  type Props = WithoutChild<SelectPrimitive.ContentProps> & {
    /**
     * Radix positioning mode. bits has no item-aligned mode: both values pop the list
     * below/above the trigger. "item-aligned" (the default) keeps the
     * `data-align-trigger` styling (no open/close animation). Both modes keep the list at
     * least as wide as the trigger, as Radix did.
     */
    position?: 'item-aligned' | 'popper';
    /** Props for the portal Radix rendered implicitly (e.g. `to`, `disabled`). */
    portalProps?: WithoutChildrenOrChild<ComponentProps<typeof SelectPrimitive.Portal>>;
  };

  let {
    ref = $bindable(null),
    class: className,
    children,
    position = 'item-aligned',
    align = 'center',
    // Radix Select always locks page scroll while open; bits defaults to false.
    preventScroll = true,
    portalProps,
    ...restProps
  }: Props = $props();
</script>

<SelectPrimitive.Portal {...portalProps}>
  <SelectPrimitive.Content
    bind:ref
    data-slot="select-content"
    data-align-trigger={position === 'item-aligned'}
    class={cn(
      'relative z-50 max-h-(--bits-select-content-available-height) min-w-36 origin-(--bits-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
      position === 'popper' &&
        'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
      className,
    )}
    {align}
    {preventScroll}
    {...restProps}
  >
    <SelectScrollUpButton />
    <SelectPrimitive.Viewport
      data-position={position}
      class={cn(
        // Radix sets the list's min-width to the trigger width in both modes.
        'min-w-(--bits-select-anchor-width) data-[position=popper]:h-(--bits-select-anchor-height) data-[position=popper]:w-full',
      )}
    >
      {@render children?.()}
    </SelectPrimitive.Viewport>
    <SelectScrollDownButton />
  </SelectPrimitive.Content>
</SelectPrimitive.Portal>
