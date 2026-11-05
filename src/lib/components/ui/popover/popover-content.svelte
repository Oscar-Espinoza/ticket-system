<script lang="ts">
  import { Popover as PopoverPrimitive, type WithoutChildrenOrChild } from 'bits-ui';
  import type { ComponentProps } from 'svelte';
  import { cn } from '@/lib/utils';
  import { getPopoverAnchorContext } from './popover-context.svelte';

  type Props = PopoverPrimitive.ContentProps & {
    /** Props for the portal Radix rendered implicitly (e.g. `to`, `disabled`). */
    portalProps?: WithoutChildrenOrChild<ComponentProps<typeof PopoverPrimitive.Portal>>;
  };

  let {
    ref = $bindable(null),
    class: className,
    align = 'center',
    sideOffset = 4,
    // Radix's (non-modal) Popover does not trap focus; bits defaults to true.
    trapFocus = false,
    customAnchor,
    portalProps,
    onInteractOutside,
    onCloseAutoFocus,
    ...restProps
  }: Props = $props();

  const anchor = getPopoverAnchorContext();

  // Radix's non-modal Popover returns focus to the trigger on close only when
  // the user did NOT click/focus outside — otherwise focus stays where they
  // clicked (e.g. a Reply box). bits-ui always refocuses the trigger, which
  // sent typed text to page hotkeys; restore Radix's rule.
  let interactedOutside = false;
  const handleInteractOutside: NonNullable<Props['onInteractOutside']> = (e) => {
    onInteractOutside?.(e);
    if (!e.defaultPrevented) interactedOutside = true;
  };
  const handleCloseAutoFocus: NonNullable<Props['onCloseAutoFocus']> = (e) => {
    onCloseAutoFocus?.(e);
    if (!e.defaultPrevented && interactedOutside) e.preventDefault();
    interactedOutside = false;
  };
</script>

<PopoverPrimitive.Portal {...portalProps}>
  <PopoverPrimitive.Content
    bind:ref
    data-slot="popover-content"
    {align}
    {sideOffset}
    {trapFocus}
    customAnchor={customAnchor ?? anchor?.element ?? null}
    onInteractOutside={handleInteractOutside}
    onCloseAutoFocus={handleCloseAutoFocus}
    class={cn(
      'z-50 flex w-72 origin-(--bits-popover-content-transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
      className,
    )}
    {...restProps}
  />
</PopoverPrimitive.Portal>
