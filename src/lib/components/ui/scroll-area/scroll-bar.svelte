<script lang="ts">
  import { ScrollArea as ScrollAreaPrimitive, type WithoutChildrenOrChild } from 'bits-ui';
  import { cn } from '@/lib/utils';

  type Props = Omit<WithoutChildrenOrChild<ScrollAreaPrimitive.ScrollbarProps>, 'orientation'> & {
    orientation?: ScrollAreaPrimitive.ScrollbarProps['orientation'];
  };

  let { ref = $bindable(null), class: className, orientation = 'vertical', ...restProps }: Props = $props();
</script>

<ScrollAreaPrimitive.Scrollbar
  bind:ref
  data-slot="scroll-area-scrollbar"
  data-orientation={orientation}
  {orientation}
  class={cn(
    'flex touch-none p-px transition-colors select-none data-horizontal:h-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-vertical:h-full data-vertical:w-2.5 data-vertical:border-l data-vertical:border-l-transparent',
    className,
  )}
  {...restProps}
>
  <ScrollAreaPrimitive.Thumb data-slot="scroll-area-thumb" class="relative flex-1 rounded-full bg-border" />
</ScrollAreaPrimitive.Scrollbar>
