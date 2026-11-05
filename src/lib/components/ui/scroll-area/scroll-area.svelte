<script lang="ts">
  import { ScrollArea as ScrollAreaPrimitive, type WithoutChild } from 'bits-ui';
  import { cn } from '@/lib/utils';
  import ScrollBar from './scroll-bar.svelte';

  type Props = WithoutChild<ScrollAreaPrimitive.RootProps> & {
    /** The scrolling viewport element (Radix exposed it only through the Viewport part). */
    viewportRef?: HTMLElement | null;
  };

  let {
    ref = $bindable(null),
    viewportRef = $bindable(null),
    class: className,
    children,
    ...restProps
  }: Props = $props();
</script>

<ScrollAreaPrimitive.Root bind:ref data-slot="scroll-area" class={cn('relative', className)} {...restProps}>
  <ScrollAreaPrimitive.Viewport
    bind:ref={viewportRef}
    data-slot="scroll-area-viewport"
    class="size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1"
  >
    {@render children?.()}
  </ScrollAreaPrimitive.Viewport>
  <ScrollBar />
  <ScrollAreaPrimitive.Corner />
</ScrollAreaPrimitive.Root>
