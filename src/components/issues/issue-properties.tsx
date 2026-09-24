'use client';

// Small read-only property displays shared by list rows, board cards and the
// detail pane (and any Wave B surface that lists issues).

import { CalendarDays, Triangle } from 'lucide-react';

import { LabelChip } from '@/components/ui-icons';
import { formatEstimate } from '@/lib/estimates';
import { dueStatus, formatDueDate } from '@/lib/dates';
import type { IssueLabel, StateType } from '@/lib/issue-model';
import { cn } from '@/lib/utils';
import { isClosed } from '@/lib/workflow';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' });

export function relativeTime(date: Date, now = Date.now()): string {
  const seconds = (new Date(date).getTime() - now) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

export function LabelChips({
  labels,
  max = 3,
  className,
}: {
  labels: IssueLabel[];
  /** Show at most this many chips, then "+N". */
  max?: number;
  className?: string;
}) {
  if (labels.length === 0) return null;
  const shown = labels.slice(0, max);
  const rest = labels.length - shown.length;
  return (
    <span className={cn('flex min-w-0 items-center gap-1', className)}>
      {shown.map((label) => (
        <LabelChip key={label.id} dotColor={label.color} className="max-w-32 truncate">
          <span className="truncate">{label.name}</span>
        </LabelChip>
      ))}
      {rest > 0 && (
        <LabelChip dot={false} title={labels.slice(max).map((l) => l.name).join(', ')}>
          +{rest}
        </LabelChip>
      )}
    </span>
  );
}

export function EstimateChip({
  scale,
  value,
  className,
}: {
  scale: string;
  value: number | null;
  className?: string;
}) {
  if (value === null || scale === 'none') return null;
  return (
    <span
      title="Estimate"
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded border border-border px-1.5 text-xs text-muted-foreground tabular-nums',
        className,
      )}
    >
      <Triangle className="size-3" aria-hidden="true" />
      {formatEstimate(scale, value)}
    </span>
  );
}

/** "Mar 4" — red when overdue, amber when due today (unless the issue is closed). */
export function DueDateChip({
  dueDate,
  stateType,
  className,
}: {
  dueDate: string | null;
  stateType: StateType;
  className?: string;
}) {
  if (!dueDate) return null;
  const status = isClosed(stateType) ? 'upcoming' : dueStatus(dueDate);
  return (
    <span
      title={status === 'overdue' ? 'Overdue' : status === 'today' ? 'Due today' : 'Due date'}
      suppressHydrationWarning
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded border border-border px-1.5 text-xs text-muted-foreground',
        status === 'overdue' && 'border-destructive/40 text-destructive',
        status === 'today' && 'border-amber-500/40 text-amber-600 dark:text-amber-400',
        className,
      )}
    >
      <CalendarDays className="size-3" aria-hidden="true" />
      {formatDueDate(dueDate)}
    </span>
  );
}
