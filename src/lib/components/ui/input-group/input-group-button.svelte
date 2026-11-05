<script lang="ts">
  import { cn } from "@/lib/utils"
  import { Button, type ButtonProps } from "@/lib/components/ui/button"
  import { inputGroupButtonVariants, type InputGroupButtonSize } from "./input-group-variants"

  let {
    ref = $bindable(null),
    class: className,
    type = "button",
    variant = "ghost",
    size = "xs",
    children,
    ...restProps
  }: Omit<ButtonProps, "size"> & {
    size?: InputGroupButtonSize | null
  } = $props()
</script>

<Button
  bind:ref
  {type}
  data-size={size}
  {variant}
  class={cn(inputGroupButtonVariants({ size }), className)}
  {...restProps}
>
  {@render children?.()}
</Button>
