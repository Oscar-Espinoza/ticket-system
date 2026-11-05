<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from "bits-ui"
  import { setAlertDialogClose } from "./alert-dialog-context"

  let {
    open = $bindable(),
    defaultOpen = false,
    onOpenChange,
    ...restProps
  }: AlertDialogPrimitive.RootProps & {
    /** Radix uncontrolled initial state; only read on mount. */
    defaultOpen?: boolean
  } = $props()

  // svelte-ignore state_referenced_locally
  if (open === undefined) open = defaultOpen

  function setOpen(next: boolean) {
    if (open === next) return
    open = next
    onOpenChange?.(next)
  }

  setAlertDialogClose(() => setOpen(false))
</script>

<AlertDialogPrimitive.Root bind:open={() => open ?? false, setOpen} {...restProps} />
