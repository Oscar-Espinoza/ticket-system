<script lang="ts">
  import type { Snippet } from "svelte"
  import { DropdownMenu as MenuPrimitive, type WithoutChildrenOrChild } from "bits-ui"
  import CheckIcon from "@lucide/svelte/icons/check"
  import { cn } from "@/lib/utils"

  let {
    ref = $bindable(null),
    class: className,
    inset,
    children: childrenProp,
    ...restProps
  }: WithoutChildrenOrChild<MenuPrimitive.RadioItemProps> & {
    inset?: boolean
    children?: Snippet
  } = $props()
</script>

<MenuPrimitive.RadioItem
  bind:ref
  data-slot="dropdown-menu-radio-item"
  data-inset={inset}
  class={cn(
    "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    className
  )}
  {...restProps}
>
  {#snippet children({ checked })}
    <span
      class="pointer-events-none absolute right-2 flex items-center justify-center" data-slot="dropdown-menu-radio-item-indicator"
    >
      {#if checked}
        <CheckIcon />
      {/if}
    </span>
    {@render childrenProp?.()}
  {/snippet}
</MenuPrimitive.RadioItem>
