<script lang="ts">
  import type { ComponentProps } from "svelte"
  import { cn } from "@/lib/utils"
  import { Input } from "@/lib/components/ui/input"

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    ...restProps
  }: ComponentProps<typeof Input> = $props()
</script>

<Input
  bind:ref
  bind:value
  data-slot="input-group-control"
  class={cn(
    "flex-1 rounded-none border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0 disabled:bg-transparent aria-invalid:ring-0 dark:bg-transparent dark:disabled:bg-transparent",
    className
  )}
  {...restProps}
/>
