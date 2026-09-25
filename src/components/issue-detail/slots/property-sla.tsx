'use client';

// Slot — owned by D5. "SLA" row (time left / overdue / met, hidden without a
// deadline or once canceled) and the "In status" row (time in the current
// state; hover for the per-state history).

import { Timer } from 'lucide-react';

import { PropertyRow } from '@/components/issue-detail/property-row';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import { SLA_TONE, slaText } from '@/components/sla/sla-chip';
import { TimeInStatus } from '@/components/sla/time-in-status';
import { useMinuteNow } from '@/components/sla/use-now';
import type { IssueRow } from '@/lib/issue-model';
import { slaStatus } from '@/lib/sla';
import { cn } from '@/lib/utils';

const dueFormat = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function PropertySla({ issue }: { issue: IssueRow; mutations: IssueMutations }) {
  const now = useMinuteNow();
  // Row presence depends only on the issue, so SSR and hydration agree; the
  // countdown text fills in once the client clock is known.
  const showSla = issue.slaDueAt !== null && issue.state.type !== 'canceled';
  const status = showSla && now !== null ? slaStatus(issue, now) : null;

  return (
    <>
      {showSla && (
        <PropertyRow label="SLA">
          <span
            className="flex min-w-0 items-center gap-1.5 text-sm"
            title={`Due ${dueFormat.format(new Date(issue.slaDueAt!))}`}
            suppressHydrationWarning
          >
            <Timer
              className={cn('size-3.5 shrink-0', status ? SLA_TONE[status.kind] : 'text-muted-foreground')}
              aria-hidden="true"
            />
            <span className={cn('tabular-nums', status && SLA_TONE[status.kind])}>
              {status ? slaText(status) : '—'}
            </span>
            {status && (status.kind === 'ok' || status.kind === 'risk') && (
              <span className="truncate text-xs text-muted-foreground" suppressHydrationWarning>
                · {dueFormat.format(new Date(issue.slaDueAt!))}
              </span>
            )}
          </span>
        </PropertyRow>
      )}
      <PropertyRow label="In status">
        <TimeInStatus issue={issue} now={now} />
      </PropertyRow>
    </>
  );
}
