<script lang="ts">
  import type { Snippet } from "svelte"
  import { DropdownMenu as MenuPrimitive, type WithoutChildrenOrChild } from "bits-ui"
  import CheckIcon from "@lucide/svelte/icons/check"
  import { cn } from "@/lib/utils"

  type CheckedState = boolean | "indeterminate"

  let {
    ref = $bindable(null),
    checked = $bindable(false),
    onCheckedChange,
    class: className,
    inset,
    children: childrenProp,
    ...restProps
  }: Omit<
    WithoutChildrenOrChild<MenuPrimitive.CheckboxItemProps>,
    "checked" | "indeterminate" | "onCheckedChange" | "onIndeterminateChange"
  > & {
    /** Radix contract: `boolean | "indeterminate"`. */
    checked?: CheckedState
    onCheckedChange?: (checked: CheckedState) => void
    inset?: boolean
    children?: Snippet
  } = $props()

  function setChecked(next: boolean) {
    checked = next
    onCheckedChange?.(next)
  }

  function setIndeterminate(next: boolean) {
    if (next) {
      checked = "indeterminate"
      onCheckedChange?.("indeterminate")
    }
  }
</script>

<MenuPrimitive.CheckboxItem
  bind:ref
  data-slot="dropdown-menu-checkbox-item"
  data-inset={inset}
  class={cn(
    "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    className
  )}
  bind:checked={() => checked === true, setChecked}
  bind:indeterminate={() => checked === "indeterminate", setIndeterminate}
  {...restProps}
>
  {#snippet children({ checked: isChecked, indeterminate })}
    <span
      class="pointer-events-none absolute right-2 flex items-center justify-center" data-slot="dropdown-menu-checkbox-item-indicator"
    >
      {#if isChecked || indeterminate}
        <CheckIcon />
      {/if}
    </span>
    {@render childrenProp?.()}
  {/snippet}
</MenuPrimitive.CheckboxItem>
