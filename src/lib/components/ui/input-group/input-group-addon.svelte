<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements"
  import type { WithElementRef } from "bits-ui"
  import { cn } from "@/lib/utils"
  import { inputGroupAddonVariants, type InputGroupAddonAlign } from "./input-group-variants"

  let {
    ref = $bindable(null),
    class: className,
    align = "inline-start",
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
    align?: InputGroupAddonAlign | null
  } = $props()

  function focusInput(e: MouseEvent & { currentTarget: EventTarget & HTMLDivElement }) {
    if ((e.target as HTMLElement).closest("button")) {
      return
    }
    e.currentTarget.parentElement?.querySelector("input")?.focus()
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  bind:this={ref}
  role="group"
  data-slot="input-group-addon"
  data-align={align}
  class={cn(inputGroupAddonVariants({ align }), className)}
  onclick={focusInput}
  {...restProps}
>
  {@render children?.()}
</div>
