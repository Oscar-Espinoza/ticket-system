// Client-safe cycle helpers (dates, names, status, stat shapes). Server code in
// src/lib/cycles.ts imports these too.
//
// Cycle dates are UTC day boundaries: `startsAt` is 00:00Z of the first day and
// `endsAt` 00:00Z of the day AFTER the last one (exclusive), so consecutive
// cycles share an edge and every viewer sees the same calendar days.

export const DAY_MS = 86_400_000;

export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const CYCLE_DURATIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
/** Auto-create keeps this many upcoming cycles scheduled. */
export const UPCOMING_CYCLES = 2;
/** Cooldown between cycles: 0 (back-to-back) … MAX_COOLDOWN_WEEKS weeks. */
export const MAX_COOLDOWN_WEEKS = 4;
export const COOLDOWN_OPTIONS = [0, 1, 2, 3, 4] as const;
/** Capacity = average throughput of this many most recent past cycles. */
export const CAPACITY_CYCLES = 3;
/** Choices for auto-archive / auto-close (null = off). */
export const AUTOMATION_MONTHS = [1, 3, 6, 9, 12] as const;

export interface CycleLike {
  number: number;
  name: string | null;
  startsAt: Date;
  endsAt: Date;
  completedAt: Date | null;
}

export type CycleStatus = 'current' | 'upcoming' | 'past';

export function cycleName(cycle: Pick<CycleLike, 'number' | 'name'>): string {
  return cycle.name?.trim() || `Cycle ${cycle.number}`;
}

/** Completed cycles are past even if their dates haven't ended (completed early). */
export function cycleStatus(cycle: CycleLike, now: Date = new Date()): CycleStatus {
  const t = now.getTime();
  if (cycle.completedAt || new Date(cycle.endsAt).getTime() <= t) return 'past';
  return new Date(cycle.startsAt).getTime() <= t ? 'current' : 'upcoming';
}

/** 00:00Z of the date's UTC day. */
export function utcDay(date: Date | number): Date {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** First day ≥ `date` (UTC) falling on `weekday` (0 = Sunday). */
export function alignOnOrAfter(date: Date | number, weekday: number): Date {
  const day = utcDay(date);
  const delta = (weekday - day.getUTCDay() + 7) % 7;
  return new Date(day.getTime() + delta * DAY_MS);
}

/** Last day ≤ `date` (UTC) falling on `weekday`. */
export function alignOnOrBefore(date: Date | number, weekday: number): Date {
  const day = utcDay(date);
  const delta = (day.getUTCDay() - weekday + 7) % 7;
  return new Date(day.getTime() - delta * DAY_MS);
}

/** UTC date → YYYY-MM-DD (for date inputs). */
export function toDateInput(date: Date | number): string {
  return new Date(date).toISOString().slice(0, 10);
}

/** YYYY-MM-DD → 00:00Z of that day. Assumes a validated string. */
export function fromDateInput(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** The last calendar day of the cycle (endsAt is exclusive). */
export function lastDay(cycle: Pick<CycleLike, 'endsAt'>): Date {
  return new Date(new Date(cycle.endsAt).getTime() - DAY_MS);
}

export function cycleLengthDays(cycle: Pick<CycleLike, 'startsAt' | 'endsAt'>): number {
  return Math.max(
    1,
    Math.round((new Date(cycle.endsAt).getTime() - new Date(cycle.startsAt).getTime()) / DAY_MS),
  );
}

const dayFormat = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const dayYearFormat = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const weekdayFormat = new Intl.DateTimeFormat('en', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

export function formatCycleDay(date: Date | number, withYear = false): string {
  return (withYear ? dayYearFormat : dayFormat).format(new Date(date));
}

export function formatWeekday(date: Date | number): string {
  return weekdayFormat.format(new Date(date));
}

/** "Jan 5 – Jan 18" (inclusive last day); the year only outside the current one. */
export function formatCycleRange(cycle: Pick<CycleLike, 'startsAt' | 'endsAt'>): string {
  const year = new Date().getUTCFullYear();
  const start = new Date(cycle.startsAt);
  const end = lastDay(cycle);
  const withYear = start.getUTCFullYear() !== year || end.getUTCFullYear() !== year;
  return `${formatCycleDay(start, withYear)} – ${formatCycleDay(end, withYear)}`;
}

/** Whole days until the cycle ends (0 on its last day). */
export function daysLeft(cycle: Pick<CycleLike, 'endsAt'>, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(cycle.endsAt).getTime() - now.getTime()) / DAY_MS) - 1);
}

/** Days until the cycle starts (upcoming cycles). */
export function daysUntil(cycle: Pick<CycleLike, 'startsAt'>, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((new Date(cycle.startsAt).getTime() - now.getTime()) / DAY_MS));
}

// ---------------------------------------------------------------------------
// Stats shapes (computed server-side in src/lib/cycles.ts)
// ---------------------------------------------------------------------------

export interface CycleTotals {
  scope: number;
  started: number;
  completed: number;
  scopePoints: number;
  startedPoints: number;
  completedPoints: number;
}

export const EMPTY_TOTALS: CycleTotals = {
  scope: 0,
  started: 0,
  completed: 0,
  scopePoints: 0,
  startedPoints: 0,
  completedPoints: 0,
};

/** One burndown sample: the cycle's state at `at` (end of a day, or now). */
export interface BurndownPoint {
  at: Date;
  /** The calendar day this sample closes (UTC); null for the cycle start. */
  day: Date | null;
  totals: CycleTotals;
}

export type ChartUnit = 'issues' | 'points';

export function scopeOf(t: CycleTotals, unit: ChartUnit): number {
  return unit === 'points' ? t.scopePoints : t.scope;
}

export function completedOf(t: CycleTotals, unit: ChartUnit): number {
  return unit === 'points' ? t.completedPoints : t.completed;
}

export function startedOf(t: CycleTotals, unit: ChartUnit): number {
  return unit === 'points' ? t.startedPoints : t.started;
}

export function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

// ---------------------------------------------------------------------------
// Capacity (average completed work of recent cycles)
// ---------------------------------------------------------------------------

export interface CycleCapacity {
  /** Average completed issues per cycle. */
  issues: number;
  /** Average completed points per cycle. */
  points: number;
  /** How many past cycles the average covers (1…CAPACITY_CYCLES). */
  sample: number;
}

/** From past cycles' totals, oldest first; null when there are none. */
export function cycleCapacity(past: CycleTotals[]): CycleCapacity | null {
  const recent = past.slice(-CAPACITY_CYCLES);
  if (recent.length === 0) return null;
  const avg = (pick: (t: CycleTotals) => number) =>
    Math.round((recent.reduce((sum, t) => sum + pick(t), 0) / recent.length) * 10) / 10;
  return {
    issues: avg((t) => t.completed),
    points: avg((t) => t.completedPoints),
    sample: recent.length,
  };
}

/** Points when estimates are on and the team has completed any; else issues. */
export function capacityUnit(capacity: CycleCapacity, estimatesEnabled: boolean): ChartUnit {
  return estimatesEnabled && capacity.points > 0 ? 'points' : 'issues';
}

export function capacityOf(capacity: CycleCapacity, unit: ChartUnit): number {
  return unit === 'points' ? capacity.points : capacity.issues;
}
