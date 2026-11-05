<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements"
  import type { WithElementRef } from "bits-ui"
  import { cn } from "@/lib/utils"

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLSpanElement>> = $props()
</script>

<span
  bind:this={ref}
  data-slot="context-menu-shortcut"
  class={cn(
    "ml-auto text-xs tracking-widest text-muted-foreground group-focus/context-menu-item:text-accent-foreground",
    className
  )}
  {...restProps}
>
  {@render children?.()}
</span>
