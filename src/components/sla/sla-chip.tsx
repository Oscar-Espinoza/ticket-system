'use client';

// Compact SLA indicator for list rows, board cards and the table (D8 renders it
// when the "sla" display property is on): "2d left" / "5h left" / "Breached".
// Returns null when the issue has no SLA or is closed (the clock stopped).

import { Timer } from 'lucide-react';

import type { IssueRow } from '@/lib/issue-model';
import { formatDuration, slaStatus, type SlaKind, type SlaStatus } from '@/lib/sla';
import { cn } from '@/lib/utils';
import { useMinuteNow } from './use-now';

export const SLA_TONE: Record<SlaKind, string> = {
  ok: 'text-emerald-600 dark:text-emerald-400',
  risk: 'text-amber-600 dark:text-amber-400',
  breached: 'text-destructive',
  met: 'text-muted-foreground',
  missed: 'text-muted-foreground',
};

/** Long form for the detail pane: "2d 4h left", "Overdue by 3h", "Met", "Missed". */
export function slaText(status: SlaStatus): string {
  switch (status.kind) {
    case 'ok':
    case 'risk':
      return `${formatDuration(status.remaining)} left`;
    case 'breached':
      return `Overdue by ${formatDuration(status.remaining)}`;
    case 'met':
      return 'Met';
    case 'missed':
      return 'Missed';
  }
}

export function SlaChip({ issue, className }: { issue: IssueRow; className?: string }) {
  const now = useMinuteNow();
  if (!issue.slaDueAt || now === null) return null;
  const status = slaStatus(issue, now);
  if (!status || status.kind === 'met' || status.kind === 'missed') return null;
  const breached = status.kind === 'breached';
  const text = breached ? 'Breached' : `${formatDuration(status.remaining, true)} left`;

  return (
    <span
      title={breached ? `SLA breached ${formatDuration(status.remaining)} ago` : `SLA: ${text}`}
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded border border-border px-1.5 text-xs tabular-nums',
        SLA_TONE[status.kind],
        breached && 'border-destructive/40',
        status.kind === 'risk' && 'border-amber-500/40',
        className,
      )}
    >
      <Timer className="size-3" aria-hidden="true" />
      <span className="sr-only">SLA: </span>
      {text}
    </span>
  );
}
