<script lang="ts">
  import { ContextMenu as MenuPrimitive } from "bits-ui"

  let { ref = $bindable(null), ...restProps }: MenuPrimitive.GroupProps = $props()
</script>

<MenuPrimitive.Group bind:ref data-slot="context-menu-group" {...restProps} />
