// Shared helpers for CapacityMeter / CapacityBadge.

import {
  capacityOf,
  capacityUnit,
  scopeOf,
  type CycleCapacity,
  type CycleTotals,
} from '@/lib/cycle-utils';

export function amount(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function unitLabel(unit: 'issues' | 'points', value: number) {
  const one = unit === 'points' ? 'point' : 'issue';
  return value === 1 ? one : `${one}s`;
}

export function measure(totals: CycleTotals, capacity: CycleCapacity, estimatesEnabled: boolean) {
  const unit = capacityUnit(capacity, estimatesEnabled);
  const scope = scopeOf(totals, unit);
  const limit = capacityOf(capacity, unit);
  return { unit, scope, limit, over: scope > limit };
}
