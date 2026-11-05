<script lang="ts">
  import { ContextMenu as MenuPrimitive } from "bits-ui"

  let { ...restProps }: MenuPrimitive.PortalProps = $props()
</script>

<MenuPrimitive.Portal {...restProps} />
