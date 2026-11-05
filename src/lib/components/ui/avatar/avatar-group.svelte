<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements"
  import type { WithElementRef } from "bits-ui"
  import { cn } from "@/lib/utils"

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props()
</script>

<div
  bind:this={ref}
  data-slot="avatar-group"
  class={cn(
    "group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
    className
  )}
  {...restProps}
>
  {@render children?.()}
</div>
