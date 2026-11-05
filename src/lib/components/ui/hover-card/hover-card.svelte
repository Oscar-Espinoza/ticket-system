<script lang="ts">
  import { LinkPreview as HoverCardPrimitive } from "bits-ui"

  let {
    open = $bindable(),
    defaultOpen = false,
    ...restProps
  }: HoverCardPrimitive.RootProps & {
    /** Radix uncontrolled initial state; only read on mount. */
    defaultOpen?: boolean
  } = $props()

  // svelte-ignore state_referenced_locally
  if (open === undefined) open = defaultOpen
</script>

<HoverCardPrimitive.Root bind:open={() => open ?? false, (v) => (open = v)} {...restProps} />
