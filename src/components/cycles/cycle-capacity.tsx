// Scope vs capacity (average completed work of the last cycles) for current and
// upcoming cycles. No hooks — usable from server and client components.

import { TriangleAlert } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  CAPACITY_CYCLES,
  capacityOf,
  capacityUnit,
  scopeOf,
  type CycleCapacity,
  type CycleTotals,
} from './cycle-utils';

function amount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function unitLabel(unit: 'issues' | 'points', value: number) {
  const one = unit === 'points' ? 'point' : 'issue';
  return value === 1 ? one : `${one}s`;
}

function measure(totals: CycleTotals, capacity: CycleCapacity, estimatesEnabled: boolean) {
  const unit = capacityUnit(capacity, estimatesEnabled);
  const scope = scopeOf(totals, unit);
  const limit = capacityOf(capacity, unit);
  return { unit, scope, limit, over: scope > limit };
}

/** Full block for the cycle page. */
export function CapacityMeter({
  totals,
  capacity,
  estimatesEnabled,
  className,
}: {
  totals: CycleTotals;
  capacity: CycleCapacity;
  estimatesEnabled: boolean;
  className?: string;
}) {
  const { unit, scope, limit, over } = measure(totals, capacity, estimatesEnabled);
  const max = Math.max(scope, limit, 1);
  const cycles = capacity.sample === 1 ? 'the last cycle' : `the last ${capacity.sample} cycles`;

  return (
    <section aria-label="Capacity" className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="text-muted-foreground">Capacity</span>
        <span className="tabular-nums">
          <span className="font-medium">{amount(scope)}</span>
          <span className="text-muted-foreground">
            {' '}
            / {amount(limit)} {unitLabel(unit, limit)}
          </span>
        </span>
        {over && (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <TriangleAlert className="size-3.5" aria-hidden="true" />
            Over capacity by {amount(Math.round((scope - limit) * 10) / 10)}
          </span>
        )}
      </div>
      <div
        role="meter"
        aria-label="Scope compared with capacity"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={scope}
        aria-valuetext={`${amount(scope)} of ${amount(limit)} ${unitLabel(unit, limit)}`}
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <span
          className={cn(
            'absolute inset-y-0 left-0',
            over ? 'bg-amber-500/80' : 'bg-muted-foreground/40',
          )}
          style={{ width: `${(scope / max) * 100}%` }}
        />
        <span
          aria-hidden="true"
          className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-foreground/70"
          style={{ left: `${(limit / max) * 100}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Average {unit} completed in {cycles}
        {capacity.sample < CAPACITY_CYCLES && ' (fewer than 3 past cycles)'}.
      </p>
    </section>
  );
}

/** Compact "12 / 10" for list rows, amber with a warning glyph when over. */
export function CapacityBadge({
  totals,
  capacity,
  estimatesEnabled,
}: {
  totals: CycleTotals;
  capacity: CycleCapacity;
  estimatesEnabled: boolean;
}) {
  const { unit, scope, limit, over } = measure(totals, capacity, estimatesEnabled);
  const text = `${amount(scope)} / ${amount(limit)} ${unitLabel(unit, limit)}`;
  return (
    <span
      title={over ? `Over capacity: ${text}` : `Scope vs capacity: ${text}`}
      className={cn(
        'inline-flex items-center gap-1 tabular-nums',
        over && 'text-amber-600 dark:text-amber-400',
      )}
    >
      {over && <TriangleAlert className="size-3.5" aria-hidden="true" />}
      <span className="sr-only">{over ? 'Over capacity: ' : 'Capacity: '}</span>
      {amount(scope)}/{amount(limit)}
      {unit === 'points' ? ' pts' : ''}
    </span>
  );
}
