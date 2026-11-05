<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements"
  import { Dialog as DialogPrimitive, type WithElementRef } from "bits-ui"
  import { cn } from "@/lib/utils"
  import { Button } from "@/lib/components/ui/button"

  let {
    ref = $bindable(null),
    class: className,
    showCloseButton = false,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
    showCloseButton?: boolean
  } = $props()
</script>

<div
  bind:this={ref}
  data-slot="dialog-footer"
  class={cn(
    "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
    className
  )}
  {...restProps}
>
  {@render children?.()}
  {#if showCloseButton}
    <DialogPrimitive.Close type="button">
      {#snippet child({ props })}
        <Button {...props} variant="outline">Close</Button>
      {/snippet}
    </DialogPrimitive.Close>
  {/if}
</div>
