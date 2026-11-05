<script lang="ts">
  import { DropdownMenu as MenuPrimitive } from "bits-ui"

  let {
    ref = $bindable(null),
    value = $bindable(),
    ...restProps
  }: MenuPrimitive.RadioGroupProps = $props()
</script>

<MenuPrimitive.RadioGroup bind:ref bind:value data-slot="dropdown-menu-radio-group" {...restProps} />
