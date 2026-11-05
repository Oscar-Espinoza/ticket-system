<script lang="ts">
  import type { ComponentProps } from "svelte"
  import { ContextMenu as MenuPrimitive, type WithoutChildrenOrChild } from "bits-ui"
  import { cn } from "@/lib/utils"
  import MenuPortal from "./context-menu-portal.svelte"

  let {
    ref = $bindable(null),
    class: className,
    loop = false,
    portalProps,
    ...restProps
  }: MenuPrimitive.ContentProps & {
    portalProps?: WithoutChildrenOrChild<ComponentProps<typeof MenuPortal>>
  } = $props()
</script>

<MenuPortal {...portalProps}>
  <MenuPrimitive.Content
    bind:ref
    data-slot="context-menu-content"
    {loop}
    class={cn("z-50 max-h-(--bits-context-menu-content-available-height) min-w-36 origin-(--bits-context-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className )}
    {...restProps}
  />
</MenuPortal>
