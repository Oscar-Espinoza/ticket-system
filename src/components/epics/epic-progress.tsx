// Progress summary: ring + percent, with the count / points breakdown in the title.

import { cn } from '@/lib/utils';
import { ProgressRing } from './epic-glyphs';
import { pointsPercent, progressPercent, type Progress } from './epic-model';

export function progressTitle(progress: Progress): string {
  const parts = [`${progress.completed} of ${progress.total} issues completed`];
  const points = pointsPercent(progress);
  if (points !== null) {
    parts.push(`${progress.completedPoints} of ${progress.points} points (${points}%)`);
  }
  return parts.join(' · ');
}

export function EpicProgress({
  progress,
  color,
  showCounts = false,
  className,
}: {
  progress: Progress;
  color?: string | null;
  /** Also render "n/m". */
  showCounts?: boolean;
  className?: string;
}) {
  const percent = progressPercent(progress);
  return (
    <span
      title={progressTitle(progress)}
      className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums', className)}
    >
      <ProgressRing percent={percent} color={color} />
      <span className="w-8 text-right">{percent}%</span>
      {showCounts && (
        <span className="text-muted-foreground/80">
          {progress.completed}/{progress.total}
        </span>
      )}
    </span>
  );
}

/** Thin bar with count + points lines, for sidebars. */
export function ProgressBlock({ progress, color }: { progress: Progress; color?: string | null }) {
  const percent = progressPercent(progress);
  const points = pointsPercent(progress);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium tabular-nums">{percent}%</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {progress.completed} / {progress.total} issues
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${percent}%`, backgroundColor: color ?? 'var(--color-primary)' }}
        />
      </div>
      {points !== null && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {progress.completedPoints} / {progress.points} points · {points}%
        </span>
      )}
      {progress.started > 0 && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {progress.started} in progress
        </span>
      )}
    </div>
  );
}
