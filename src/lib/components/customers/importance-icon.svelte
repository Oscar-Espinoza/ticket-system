<!-- Four bars, filled up to the level — reads like the priority glyph. -->
<script lang="ts">
  import { cn } from '@/lib/utils';
  import { IMPORTANCE_LABEL, type Importance } from '@/components/customers/customer-model';

  let { importance, class: className }: { importance: Importance | null; class?: string } = $props();

  const IMPORTANCE_LEVEL: Record<Importance, number> = { low: 1, medium: 2, high: 3, critical: 4 };
  const level = $derived(importance ? IMPORTANCE_LEVEL[importance] : 0);
</script>

<svg
  viewBox="0 0 16 16"
  role="img"
  aria-label={importance ? `${IMPORTANCE_LABEL[importance]} importance` : 'No importance'}
  class={cn(
    'size-3.5 shrink-0',
    importance === 'critical' ? 'text-destructive' : 'text-foreground',
    className,
  )}
>
  {#each [0, 1, 2, 3] as i (i)}
    <rect
      x={1 + i * 3.75}
      y={11 - i * 3}
      width={2.5}
      height={4 + i * 3}
      rx={0.75}
      fill="currentColor"
      opacity={i < level ? 1 : 0.25}
    />
  {/each}
</svg>
