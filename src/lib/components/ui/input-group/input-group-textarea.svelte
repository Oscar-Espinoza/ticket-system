<script lang="ts">
  import type { ComponentProps } from "svelte"
  import { cn } from "@/lib/utils"
  import { Textarea } from "@/lib/components/ui/textarea"

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    ...restProps
  }: ComponentProps<typeof Textarea> = $props()
</script>

<Textarea
  bind:ref
  bind:value
  data-slot="input-group-control"
  class={cn(
    "flex-1 resize-none rounded-none border-0 bg-transparent py-2 shadow-none ring-0 focus-visible:ring-0 disabled:bg-transparent aria-invalid:ring-0 dark:bg-transparent dark:disabled:bg-transparent",
    className
  )}
  {...restProps}
/>
