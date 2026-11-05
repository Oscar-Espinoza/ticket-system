<script lang="ts">
  import { DropdownMenu as MenuPrimitive } from "bits-ui"

  // Radix rendered `<button type="button">` (and passed it through asChild); bits does not.
  let { ref = $bindable(null), type = "button", ...restProps }: MenuPrimitive.TriggerProps = $props()
</script>

<MenuPrimitive.Trigger bind:ref data-slot="dropdown-menu-trigger" {type} {...restProps} />
