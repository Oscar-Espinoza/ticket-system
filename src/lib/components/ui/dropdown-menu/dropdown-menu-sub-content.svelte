<script lang="ts">
  import { DropdownMenu as MenuPrimitive } from "bits-ui"
  import { cn } from "@/lib/utils"

  let {
    ref = $bindable(null),
    class: className,
    align = "start",
    loop = false,
    ...restProps
  }: MenuPrimitive.SubContentProps = $props()
</script>

<MenuPrimitive.SubContent
  bind:ref
  data-slot="dropdown-menu-sub-content"
  {align}
  {loop}
  class={cn("z-50 min-w-[96px] origin-(--bits-dropdown-menu-content-transform-origin) overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className )}
  {...restProps}
/>
