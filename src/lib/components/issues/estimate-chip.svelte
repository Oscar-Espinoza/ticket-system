<!-- Estimate chip (triangle + value). Port of EstimateChip from src/components/issues/issue-properties.tsx. -->
<script lang="ts">
  import TriangleIcon from '@lucide/svelte/icons/triangle';

  import { formatEstimate } from '@/lib/estimates';
  import { cn } from '@/lib/utils';

  let {
    scale,
    value,
    class: className,
  }: {
    scale: string;
    value: number | null;
    class?: string;
  } = $props();
</script>

{#if value !== null && scale !== 'none'}
  <span
    title="Estimate"
    class={cn(
      'inline-flex h-5 shrink-0 items-center gap-1 rounded border border-border px-1.5 text-xs text-muted-foreground tabular-nums',
      className,
    )}
  >
    <TriangleIcon class="size-3" aria-hidden="true" />
    {formatEstimate(scale, value)}
  </span>
{/if}
