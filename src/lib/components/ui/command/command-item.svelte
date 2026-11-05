<script lang="ts">
  import type { Snippet } from "svelte"
  import { Command as CommandPrimitive, type WithoutChildrenOrChild } from "bits-ui"
  import CheckIcon from "@lucide/svelte/icons/check"
  import { cn } from "@/lib/utils"

  let {
    ref = $bindable(null),
    class: className,
    value,
    onSelect,
    children,
    ...restProps
  }: Omit<WithoutChildrenOrChild<CommandPrimitive.ItemProps>, "onSelect"> & {
    /** cmdk contract: receives the item's value (bits-ui passes nothing). */
    onSelect?: (value: string) => void
    children?: Snippet
  } = $props()

  function handleSelect() {
    onSelect?.(ref?.getAttribute("data-value") ?? value ?? "")
  }
</script>

<!-- cmdk's data-[disabled=true] → bits-ui's presence attribute data-disabled. -->
<CommandPrimitive.Item
  bind:ref
  data-slot="command-item"
  {value}
  onSelect={handleSelect}
  class={cn(
    "group/command-item relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none in-data-[slot=dialog-content]:rounded-lg! data-disabled:pointer-events-none data-disabled:opacity-50 data-selected:bg-muted data-selected:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-selected:*:[svg]:text-foreground",
    className
  )}
  {...restProps}
>
  {@render children?.()}
  <CheckIcon class="ml-auto opacity-0 group-has-data-[slot=command-shortcut]/command-item:hidden group-data-[checked=true]/command-item:opacity-100" />
</CommandPrimitive.Item>
