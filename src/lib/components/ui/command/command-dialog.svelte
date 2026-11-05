<script lang="ts">
  import type { ComponentProps, Snippet } from "svelte"
  import { cn } from "@/lib/utils"
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
  } from "@/lib/components/ui/dialog"

  let {
    open = $bindable(),
    title = "Command Palette",
    description = "Search for a command to run...",
    children,
    class: className,
    showCloseButton = false,
    ...restProps
  }: Omit<ComponentProps<typeof Dialog>, "children"> & {
    title?: string
    description?: string
    class?: string
    showCloseButton?: boolean
    children?: Snippet
  } = $props()
</script>

<Dialog bind:open {...restProps}>
  <DialogHeader class="sr-only">
    <DialogTitle>{title}</DialogTitle>
    <DialogDescription>{description}</DialogDescription>
  </DialogHeader>
  <DialogContent
    class={cn("top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0", className)}
    {showCloseButton}
  >
    {@render children?.()}
  </DialogContent>
</Dialog>
