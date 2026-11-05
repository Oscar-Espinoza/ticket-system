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
  data-slot="card-description"
  class={cn(
    "text-sm text-muted-foreground",
    className
  )}
  {...restProps}
>
  {@render children?.()}
</div>
