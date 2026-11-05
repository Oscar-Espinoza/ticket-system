<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { cn } from '@/lib/utils';

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: HTMLAttributes<HTMLDivElement> & { ref?: HTMLDivElement | null } = $props();
</script>

<div bind:this={ref} data-slot="popover-header" class={cn('flex flex-col gap-0.5 text-sm', className)} {...restProps}>
  {@render children?.()}
</div>
