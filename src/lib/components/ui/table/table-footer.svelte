<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { cn } from '@/lib/utils';

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: HTMLAttributes<HTMLTableSectionElement> & { ref?: HTMLTableSectionElement | null } = $props();
</script>

<tfoot
  bind:this={ref}
  data-slot="table-footer"
  class={cn(
    'border-t bg-muted/50 font-medium [&>tr]:last:border-b-0',
    className,
  )}
  {...restProps}
>
  {@render children?.()}
</tfoot>
