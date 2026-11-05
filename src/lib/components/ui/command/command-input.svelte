<script lang="ts">
  import { Command as CommandPrimitive } from "bits-ui"
  import SearchIcon from "@lucide/svelte/icons/search"
  import { cn } from "@/lib/utils"
  import { InputGroup, InputGroupAddon } from "@/lib/components/ui/input-group"

  let {
    ref = $bindable(null),
    value = $bindable(""),
    onValueChange,
    class: className,
    ...restProps
  }: CommandPrimitive.InputProps & {
    /** cmdk contract: called with the new search text on every change. */
    onValueChange?: (search: string) => void
  } = $props()

  function setValue(next: string) {
    value = next
    onValueChange?.(next)
  }
</script>

<div data-slot="command-input-wrapper" class="p-1 pb-0">
  <InputGroup class="h-8! rounded-lg! border-input/30 bg-input/30 shadow-none! *:data-[slot=input-group-addon]:pl-2!">
    <CommandPrimitive.Input
      bind:ref
      bind:value={() => value ?? "", setValue}
      data-slot="command-input"
      class={cn(
        "w-full text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...restProps}
    />
    <InputGroupAddon>
      <SearchIcon class="size-4 shrink-0 opacity-50" />
    </InputGroupAddon>
  </InputGroup>
</div>
