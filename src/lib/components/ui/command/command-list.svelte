<script lang="ts">
  import { Command as CommandPrimitive } from "bits-ui"
  import { cn } from "@/lib/utils"

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: CommandPrimitive.ListProps = $props()
</script>

<!--
  The Viewport is bits' equivalent of cmdk's `[cmdk-list-sizer]`: it sets the root's
  viewportNode, which score sorting of ungrouped items/groups, `aria-activedescendant`/
  `aria-controls` on the input, and `--bits-command-list-height` all depend on.
-->
<CommandPrimitive.List
  bind:ref
  data-slot="command-list"
  class={cn(
    "no-scrollbar max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto outline-none",
    className
  )}
  {...restProps}
>
  <CommandPrimitive.Viewport>
    {@render children?.()}
  </CommandPrimitive.Viewport>
</CommandPrimitive.List>
