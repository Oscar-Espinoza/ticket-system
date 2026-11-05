<script lang="ts">
  import { Command as CommandPrimitive } from "bits-ui"
  import { cn } from "@/lib/utils"

  let {
    ref = $bindable(null),
    class: className,
    alwaysRender = false,
    forceMount,
    ...restProps
  }: CommandPrimitive.SeparatorProps & {
    /** cmdk name for bits-ui's `forceMount`. */
    alwaysRender?: boolean
  } = $props()
</script>

<CommandPrimitive.Separator
  bind:ref
  data-slot="command-separator"
  forceMount={forceMount ?? alwaysRender}
  class={cn("-mx-1 h-px bg-border", className)}
  {...restProps}
/>
