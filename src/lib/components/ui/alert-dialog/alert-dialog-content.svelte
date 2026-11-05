<script lang="ts">
  import type { ComponentProps } from "svelte"
  import { AlertDialog as AlertDialogPrimitive, type WithoutChildrenOrChild } from "bits-ui"
  import { cn } from "@/lib/utils"
  import AlertDialogOverlay from "./alert-dialog-overlay.svelte"
  import AlertDialogPortal from "./alert-dialog-portal.svelte"

  let {
    ref = $bindable(null),
    class: className,
    size = "default",
    portalProps,
    onOpenAutoFocus,
    ...restProps
  }: AlertDialogPrimitive.ContentProps & {
    size?: "default" | "sm"
    portalProps?: WithoutChildrenOrChild<ComponentProps<typeof AlertDialogPortal>>
  } = $props()

  // Radix AlertDialog focused Cancel on open (Enter/Space right away cancels);
  // bits focuses the content node. Restore Radix unless the caller prevents it.
  function handleOpenAutoFocus(e: Event) {
    onOpenAutoFocus?.(e)
    if (e.defaultPrevented) return
    const node = ref
    const cancel = node?.querySelector<HTMLElement>('[data-slot="alert-dialog-cancel"]')
    if (!cancel) return // no Cancel: fall back to the bits default (focus the content)
    e.preventDefault()
    // bits focuses after a tick too; wait so the node is mounted and the focus trap active
    setTimeout(() => {
      if (cancel.isConnected) cancel.focus()
    }, 0)
  }
</script>

<AlertDialogPortal {...portalProps}>
  <AlertDialogOverlay />
  <AlertDialogPrimitive.Content
    bind:ref
    data-slot="alert-dialog-content"
    data-size={size}
    onOpenAutoFocus={handleOpenAutoFocus}
    class={cn(
      "group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-full -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-popover-foreground shadow-popover ring-1 ring-foreground/10 duration-(--motion-base) outline-none data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
      className
    )}
    {...restProps}
  />
</AlertDialogPortal>
