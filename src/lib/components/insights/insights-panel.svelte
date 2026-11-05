<script lang="ts">
  import type { Snippet } from 'svelte';

  import { cn } from '@/lib/utils';

  let {
    title,
    description,
    children,
    class: className,
  }: {
    title: string;
    description?: string;
    children?: Snippet;
    class?: string;
  } = $props();
</script>

<section class={cn('flex min-w-0 flex-col gap-3 rounded-lg border border-border p-4', className)}>
  <header>
    <h2 class="text-sm font-medium">{title}</h2>
    {#if description}<p class="text-xs text-muted-foreground">{description}</p>{/if}
  </header>
  {@render children?.()}
</section>
