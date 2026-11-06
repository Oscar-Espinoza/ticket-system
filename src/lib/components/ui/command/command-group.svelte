<script lang="ts">
  import type { Snippet } from "svelte"
  import { Command as CommandPrimitive, type WithoutChildrenOrChild } from "bits-ui"
  import { cn } from "@/lib/utils"

  let {
    ref = $bindable(null),
    class: className,
    heading,
    value,
    children,
    ...restProps
  }: WithoutChildrenOrChild<CommandPrimitive.GroupProps> & {
    /** cmdk `heading`: plain text or a snippet . */
    heading?: string | Snippet
    children?: Snippet
  } = $props()
</script>

<!-- cmdk's [cmdk-group-heading] selectors → bits-ui's [data-command-group-heading]. -->
<CommandPrimitive.Group
  bind:ref
  data-slot="command-group"
  value={value ?? (typeof heading === "string" ? heading : undefined)}
  class={cn(
    "overflow-hidden p-1 text-foreground **:data-[command-group-heading]:px-2 **:data-[command-group-heading]:py-1.5 **:data-[command-group-heading]:text-xs **:data-[command-group-heading]:font-medium **:data-[command-group-heading]:text-muted-foreground",
    className
  )}
  {...restProps}
>
  {#if heading}
    <CommandPrimitive.GroupHeading aria-hidden="true">
      {#if typeof heading === "string"}
        {heading}
      {:else}
        {@render heading()}
      {/if}
    </CommandPrimitive.GroupHeading>
  {/if}
  <CommandPrimitive.GroupItems>
    {@render children?.()}
  </CommandPrimitive.GroupItems>
</CommandPrimitive.Group>
