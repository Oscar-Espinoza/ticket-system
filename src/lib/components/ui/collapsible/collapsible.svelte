<script lang="ts">
  import { Collapsible as CollapsiblePrimitive } from "bits-ui"

  let {
    ref = $bindable(null),
    open = $bindable(),
    defaultOpen = false,
    ...restProps
  }: CollapsiblePrimitive.RootProps & {
    /** Radix uncontrolled initial state; only read on mount. */
    defaultOpen?: boolean
  } = $props()

  // Radix `defaultOpen` seeds the state once when `open` is not controlled.
  // svelte-ignore state_referenced_locally
  if (open === undefined) open = defaultOpen
</script>

<CollapsiblePrimitive.Root
  bind:ref
  bind:open={() => open ?? false, (v) => (open = v)}
  data-slot="collapsible"
  {...restProps}
/>
