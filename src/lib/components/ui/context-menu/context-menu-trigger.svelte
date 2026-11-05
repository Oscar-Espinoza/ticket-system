<script lang="ts">
  import { ContextMenu as MenuPrimitive } from "bits-ui"
  import { cn } from "@/lib/utils"

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: MenuPrimitive.TriggerProps = $props()
</script>

<MenuPrimitive.Trigger
  bind:ref
  data-slot="context-menu-trigger"
  class={cn("select-none", className)}
  {...restProps}
/>
