<script lang="ts">
  import { DropdownMenu as MenuPrimitive } from "bits-ui"

  let {
    open = $bindable(),
    defaultOpen = false,
    ...restProps
  }: MenuPrimitive.RootProps & {
    /** Radix uncontrolled initial state; only read on mount. */
    defaultOpen?: boolean
  } = $props()

  // svelte-ignore state_referenced_locally
  if (open === undefined) open = defaultOpen
</script>

<MenuPrimitive.Root bind:open={() => open ?? false, (v) => (open = v)} {...restProps} />
