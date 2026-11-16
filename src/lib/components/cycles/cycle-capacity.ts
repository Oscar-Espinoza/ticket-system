// Shared helpers for CapacityMeter / CapacityBadge.

import { m } from '@/lib/i18n';
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
  return unit === 'points' ? m.projects_unit_points({ count: value }) : m.projects_unit_issues({ count: value });
}

export function measure(totals: CycleTotals, capacity: CycleCapacity, estimatesEnabled: boolean) {
  const unit = capacityUnit(capacity, estimatesEnabled);
  const scope = scopeOf(totals, unit);
  const limit = capacityOf(capacity, unit);
  return { unit, scope, limit, over: scope > limit };
}
