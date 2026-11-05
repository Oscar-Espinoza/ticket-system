<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { cn } from '@/lib/utils';

  // bits Select has no Separator part; Radix's was an aria-hidden div.
  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: HTMLAttributes<HTMLDivElement> & { ref?: HTMLDivElement | null } = $props();
</script>

<div
  bind:this={ref}
  aria-hidden="true"
  data-slot="select-separator"
  class={cn('pointer-events-none -mx-1 my-1 h-px bg-border', className)}
  {...restProps}
></div>
