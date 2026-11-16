<!-- Thin bar with count + points lines, for sidebars. -->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import { pointsPercent, progressPercent, type Progress } from '@/lib/epic-model';

  let { progress, color }: { progress: Progress; color?: string | null } = $props();

  const percent = $derived(progressPercent(progress));
  const points = $derived(pointsPercent(progress));
</script>

<div class="flex flex-col gap-1.5">
  <div class="flex items-baseline justify-between text-sm">
    <span class="font-medium tabular-nums">{percent}%</span>
    <span class="text-xs text-muted-foreground tabular-nums">
      {m.projects_progress_issues({ completed: progress.completed, total: progress.total })}
    </span>
  </div>
  <div class="h-1.5 overflow-hidden rounded-full bg-muted">
    <div
      class="h-full rounded-full transition-[width]"
      style="width: {percent}%; background-color: {color ?? 'var(--color-primary)'}"
    ></div>
  </div>
  {#if points !== null}
    <span class="text-xs text-muted-foreground tabular-nums">
      {m.projects_progress_points({ completed: progress.completedPoints, total: progress.points, percent: points })}
    </span>
  {/if}
  {#if progress.started > 0}
    <span class="text-xs text-muted-foreground tabular-nums">
      {m.projects_progress_started({ count: progress.started })}
    </span>
  {/if}
</div>
