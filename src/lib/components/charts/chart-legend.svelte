<script lang="ts">
  import { cn } from '@/lib/utils';
  import type { SwatchKind } from './chart-frame.svelte.ts';
  import Swatch from './swatch.svelte';

  let {
    items,
    class: className,
  }: {
    items: { label: string; color: string; kind?: SwatchKind }[];
    class?: string;
  } = $props();
</script>

<ul class={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-xs', className)}>
  {#each items as item (item.label)}
    <li class="flex items-center gap-1.5 text-muted-foreground">
      <Swatch color={item.color} kind={item.kind} />
      {item.label}
    </li>
  {/each}
</ul>
