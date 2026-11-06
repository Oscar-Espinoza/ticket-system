// Client-safe insights result shapes and the range choices.

import type { Priority, StateType } from '@/lib/issue-model';

export const INSIGHT_RANGES = [4, 12, 26, 52] as const;
export type InsightRange = (typeof INSIGHT_RANGES)[number];
export const DEFAULT_INSIGHT_RANGE: InsightRange = 12;

export function parseInsightRange(value: unknown): InsightRange {
  const weeks = typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
  return (INSIGHT_RANGES as readonly number[]).includes(weeks)
    ? (weeks as InsightRange)
    : DEFAULT_INSIGHT_RANGE;
}

export interface WeekPoint {
  /** Monday, YYYY-MM-DD (UTC). */
  week: string;
  created: number;
  completed: number;
}

export interface BreakdownRow {
  id: string;
  label: string;
  count: number;
  color?: string | null;
  image?: string | null;
  stateType?: StateType;
  priority?: Priority;
}

export interface Distribution {
  /** Issues measured. */
  count: number;
  /** Median, in hours; null without data. */
  medianHours: number | null;
  buckets: { label: string; count: number }[];
}

export interface ProjectInsights {
  weeks: WeekPoint[];
  totals: { open: number; created: number; completed: number };
  byState: BreakdownRow[];
  byPriority: BreakdownRow[];
  byAssignee: BreakdownRow[];
  byLabel: BreakdownRow[];
  cycleTime: Distribution;
  leadTime: Distribution;
}
