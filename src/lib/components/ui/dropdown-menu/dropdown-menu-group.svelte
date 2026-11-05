<script lang="ts">
  import { DropdownMenu as MenuPrimitive } from "bits-ui"

  let { ref = $bindable(null), ...restProps }: MenuPrimitive.GroupProps = $props()
</script>

<MenuPrimitive.Group bind:ref data-slot="dropdown-menu-group" {...restProps} />
