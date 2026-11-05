<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from "bits-ui"
  import { cn } from "@/lib/utils"
  import { buttonVariants, type ButtonSize, type ButtonVariant } from "@/lib/components/ui/button"
  import { getAlertDialogClose } from "./alert-dialog-context"

  let {
    ref = $bindable(null),
    class: className,
    variant = "default",
    size = "default",
    type = "button",
    onclick,
    ...restProps
  }: AlertDialogPrimitive.ActionProps & {
    variant?: ButtonVariant
    size?: ButtonSize
  } = $props()

  const close = getAlertDialogClose()

  // Radix's Action closed the dialog after the caller's onClick unless it called
  // event.preventDefault(); bits-ui's Action does nothing, so restore that here.
  function handleClick(event: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }) {
    onclick?.(event)
    if (!event.defaultPrevented) close()
  }
</script>

<AlertDialogPrimitive.Action
  bind:ref
  data-slot="alert-dialog-action"
  data-variant={variant}
  data-size={size}
  class={`${cn(buttonVariants({ variant, size }))} ${cn(className)}`.trim()}
  {type}
  onclick={handleClick}
  {...restProps}
/>
