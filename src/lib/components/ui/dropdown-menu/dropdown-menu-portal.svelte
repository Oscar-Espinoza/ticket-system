<script lang="ts">
  import { DropdownMenu as MenuPrimitive } from "bits-ui"

  let { ...restProps }: MenuPrimitive.PortalProps = $props()
</script>

<MenuPrimitive.Portal {...restProps} />
