<script lang="ts" module>
  import { cva, type VariantProps } from 'class-variance-authority';

  export const tabsListVariants = cva(
    'group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none',
    {
      variants: {
        variant: {
          default: 'bg-muted',
          line: 'gap-1 bg-transparent',
        },
      },
      defaultVariants: {
        variant: 'default',
      },
    },
  );

  export type TabsListVariants = VariantProps<typeof tabsListVariants>;
  export type TabsListVariant = TabsListVariants['variant'];
</script>

<script lang="ts">
  import { Tabs as TabsPrimitive } from 'bits-ui';
  import { cn } from '@/lib/utils';

  let {
    ref = $bindable(null),
    class: className,
    variant = 'default',
    ...restProps
  }: TabsPrimitive.ListProps & TabsListVariants = $props();
</script>

<TabsPrimitive.List
  bind:ref
  data-slot="tabs-list"
  data-variant={variant}
  class={cn(tabsListVariants({ variant }), className)}
  {...restProps}
/>
