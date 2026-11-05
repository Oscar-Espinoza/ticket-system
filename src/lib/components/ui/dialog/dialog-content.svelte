<script lang="ts">
  import type { ComponentProps, Snippet } from "svelte"
  import { Dialog as DialogPrimitive, type WithoutChildrenOrChild } from "bits-ui"
  import XIcon from "@lucide/svelte/icons/x"
  import { cn } from "@/lib/utils"
  import { Button } from "@/lib/components/ui/button"
  import DialogOverlay from "./dialog-overlay.svelte"
  import DialogPortal from "./dialog-portal.svelte"

  let {
    ref = $bindable(null),
    class: className,
    portalProps,
    children,
    showCloseButton = true,
    ...restProps
  }: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
    portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DialogPortal>>
    children?: Snippet
    showCloseButton?: boolean
  } = $props()
</script>

<DialogPortal {...portalProps}>
  <DialogOverlay />
  <DialogPrimitive.Content
    bind:ref
    data-slot="dialog-content"
    class={cn(
      "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-popover ring-1 ring-foreground/10 duration-(--motion-base) outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
      className
    )}
    {...restProps}
  >
    {@render children?.()}
    {#if showCloseButton}
      <DialogPrimitive.Close data-slot="dialog-close" type="button">
        {#snippet child({ props })}
          <Button {...props} variant="ghost" class="absolute top-2 right-2" size="icon-sm">
            <XIcon />
            <span class="sr-only">Close</span>
          </Button>
        {/snippet}
      </DialogPrimitive.Close>
    {/if}
  </DialogPrimitive.Content>
</DialogPortal>
