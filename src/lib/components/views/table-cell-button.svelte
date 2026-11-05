<!-- Cell trigger: out of the tab order (the row is the stop), clicks don't open the issue.
     (CellButton in src/components/views/table-view.tsx.) Spread a picker trigger's
     `props` onto it: {#snippet children({ props })}<TableCellButton {...props} label="…">…{/snippet} -->
<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';

  import { cn } from '@/lib/utils';

  let {
    label,
    onclick,
    class: className,
    children,
    ...rest
  }: HTMLButtonAttributes & { label: string } = $props();
</script>

<button
  type="button"
  tabindex={-1}
  aria-label={label}
  class={cn(
    'flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded px-1.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
    className,
  )}
  {...rest}
  onclick={(event) => {
    event.stopPropagation();
    onclick?.(event);
  }}
>
  {@render children?.()}
</button>
