<script lang="ts">
  import { ContextMenu as MenuPrimitive } from "bits-ui"

  let {
    open = $bindable(),
    defaultOpen = false,
    ...restProps
  }: MenuPrimitive.SubProps & {
    /** Radix uncontrolled initial state; only read on mount. */
    defaultOpen?: boolean
  } = $props()

  // svelte-ignore state_referenced_locally
  if (open === undefined) open = defaultOpen
</script>

<MenuPrimitive.Sub bind:open={() => open ?? false, (v) => (open = v)} {...restProps} />
