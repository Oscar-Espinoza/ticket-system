<!-- Progress summary: ring + percent, with the count / points breakdown in the title. -->
<script module lang="ts">
  import { pointsPercent, type Progress } from '@/lib/epic-model';

  export function progressTitle(progress: Progress): string {
    const parts = [`${progress.completed} of ${progress.total} issues completed`];
    const points = pointsPercent(progress);
    if (points !== null) {
      parts.push(`${progress.completedPoints} of ${progress.points} points (${points}%)`);
    }
    return parts.join(' · ');
  }
</script>

<script lang="ts">
  import { cn } from '@/lib/utils';
  import { progressPercent } from '@/lib/epic-model';
  import ProgressRing from './progress-ring.svelte';

  let {
    progress,
    color,
    showCounts = false,
    class: className,
  }: {
    progress: Progress;
    color?: string | null;
    /** Also render "n/m". */
    showCounts?: boolean;
    class?: string;
  } = $props();

  const percent = $derived(progressPercent(progress));
</script>

<span
  title={progressTitle(progress)}
  class={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums', className)}
>
  <ProgressRing {percent} {color} />
  <span class="w-8 text-right">{percent}%</span>
  {#if showCounts}
    <span class="text-muted-foreground/80">
      {progress.completed}/{progress.total}
    </span>
  {/if}
</span>
