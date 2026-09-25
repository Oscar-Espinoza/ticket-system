// Presentational cycle numbers shared by the list and detail pages (no hooks —
// usable from server and client components).

import { cn } from '@/lib/utils';
import { percent, type CycleTotals } from './cycle-utils';

/** Stacked completed / started bar. */
export function CycleProgressBar({
  totals,
  className,
}: {
  totals: CycleTotals;
  className?: string;
}) {
  const done = percent(totals.completed, totals.scope);
  const started = percent(totals.started, totals.scope);
  return (
    <div
      role="progressbar"
      aria-label="Cycle progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={done}
      aria-valuetext={`${done}% completed, ${started}% in progress`}
      className={cn('flex h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <span className="h-full bg-primary" style={{ width: `${done}%` }} />
      <span className="h-full bg-amber-500/70" style={{ width: `${started}%` }} />
    </div>
  );
}

function Stat({
  label,
  count,
  points,
  total,
  showPoints,
  dotClass,
}: {
  label: string;
  count: number;
  points: number;
  total: number;
  showPoints: boolean;
  dotClass?: string;
}) {
  return (
    <div className="flex min-w-24 flex-col gap-0.5">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {dotClass && <span aria-hidden="true" className={cn('size-2 rounded-full', dotClass)} />}
        {label}
      </span>
      <span className="text-sm">
        <span className="font-medium tabular-nums">{count}</span>
        <span className="text-muted-foreground">
          {' '}
          {count === 1 ? 'issue' : 'issues'}
          {total > 0 && label !== 'Scope' && ` · ${percent(count, total)}%`}
        </span>
      </span>
      {showPoints && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {points} {points === 1 ? 'point' : 'points'}
        </span>
      )}
    </div>
  );
}

export function CycleStats({
  totals,
  showPoints,
  className,
}: {
  totals: CycleTotals;
  showPoints: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap gap-x-8 gap-y-3', className)}>
      <Stat
        label="Scope"
        count={totals.scope}
        points={totals.scopePoints}
        total={totals.scope}
        showPoints={showPoints}
        dotClass="bg-muted-foreground/40"
      />
      <Stat
        label="Started"
        count={totals.started}
        points={totals.startedPoints}
        total={totals.scope}
        showPoints={showPoints}
        dotClass="bg-amber-500/70"
      />
      <Stat
        label="Completed"
        count={totals.completed}
        points={totals.completedPoints}
        total={totals.scope}
        showPoints={showPoints}
        dotClass="bg-primary"
      />
    </div>
  );
}

/** Ring glyph: dashed (upcoming), progress arc (current), filled check (past). */
export function CycleGlyph({
  status,
  progress = 0,
  size = 16,
  className,
}: {
  status: 'current' | 'upcoming' | 'past';
  /** 0–100, current cycles. */
  progress?: number;
  size?: number;
  className?: string;
}) {
  const r = 6;
  const c = 2 * Math.PI * r;
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      className={cn(
        'shrink-0',
        status === 'current' ? 'text-primary' : 'text-muted-foreground',
        className,
      )}
    >
      {status === 'past' ? (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.8" />
          <path
            d="M5.2 8.2 7.1 10l3.7-4"
            stroke="var(--background)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          <circle
            cx="8"
            cy="8"
            r={r}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray={status === 'upcoming' ? '2 2' : undefined}
            opacity={status === 'current' ? 0.35 : 1}
          />
          {status === 'current' && (
            <circle
              cx="8"
              cy="8"
              r={r}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray={`${(Math.min(100, Math.max(0, progress)) / 100) * c} ${c}`}
              transform="rotate(-90 8 8)"
              strokeLinecap="round"
            />
          )}
        </>
      )}
    </svg>
  );
}
