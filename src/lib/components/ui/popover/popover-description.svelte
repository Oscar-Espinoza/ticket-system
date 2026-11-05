<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import { cn } from '@/lib/utils';

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: HTMLAttributes<HTMLParagraphElement> & { ref?: HTMLParagraphElement | null } = $props();
</script>

<p bind:this={ref} data-slot="popover-description" class={cn('text-muted-foreground', className)} {...restProps}>
  {@render children?.()}
</p>
