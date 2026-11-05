<script lang="ts">
  import { Tabs as TabsPrimitive, type WithoutChild } from 'bits-ui';
  import { cn } from '@/lib/utils';

  type Props = WithoutChild<TabsPrimitive.ContentProps> & {
    /** Radix `forceMount`: keep the children mounted while the tab is inactive. */
    forceMount?: boolean;
  };

  let {
    ref = $bindable(null),
    class: className,
    forceMount = false,
    children,
    ...restProps
  }: Props = $props();
</script>

<!--
  bits keeps inactive panels mounted behind `hidden`; Radix renders the hidden
  panel element but unmounts its children. Match Radix.
-->
<TabsPrimitive.Content
  bind:ref
  data-slot="tabs-content"
  class={cn('flex-1 text-sm outline-none', className)}
  {...restProps}
>
  {#snippet child({ props })}
    <div {...props}>
      {#if forceMount || !props.hidden}
        {@render children?.()}
      {/if}
    </div>
  {/snippet}
</TabsPrimitive.Content>
