<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from "bits-ui"
  import { cn } from "@/lib/utils"
  import { buttonVariants, type ButtonSize, type ButtonVariant } from "@/lib/components/ui/button"

  let {
    ref = $bindable(null),
    class: className,
    variant = "outline",
    size = "default",
    type = "button",
    ...restProps
  }: AlertDialogPrimitive.CancelProps & {
    variant?: ButtonVariant
    size?: ButtonSize
  } = $props()
</script>

<AlertDialogPrimitive.Cancel
  bind:ref
  data-slot="alert-dialog-cancel"
  data-variant={variant}
  data-size={size}
  class={`${cn(buttonVariants({ variant, size }))} ${cn(className)}`.trim()}
  {type}
  {...restProps}
/>
