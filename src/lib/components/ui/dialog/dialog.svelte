<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui"

  let {
    open = $bindable(),
    defaultOpen = false,
    ...restProps
  }: DialogPrimitive.RootProps & {
    /** Radix uncontrolled initial state; only read on mount. */
    defaultOpen?: boolean
  } = $props()

  // svelte-ignore state_referenced_locally
  if (open === undefined) open = defaultOpen
</script>

<DialogPrimitive.Root bind:open={() => open ?? false, (v) => (open = v)} {...restProps} />
