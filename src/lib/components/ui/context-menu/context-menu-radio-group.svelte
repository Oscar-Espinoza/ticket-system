<script lang="ts">
  import { ContextMenu as MenuPrimitive } from "bits-ui"

  let {
    ref = $bindable(null),
    value = $bindable(),
    ...restProps
  }: MenuPrimitive.RadioGroupProps = $props()
</script>

<MenuPrimitive.RadioGroup bind:ref bind:value data-slot="context-menu-radio-group" {...restProps} />
