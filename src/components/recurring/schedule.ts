// Recurring-issue schedules (client-safe): validation, next occurrences and a
// human summary. Days are UTC calendar days, like cycles: an occurrence's
// `nextRunAt` is 00:00Z of its day and the daily cron creates it that day.

import { DAY_MS, WEEKDAYS, formatWeekday, fromDateInput, utcDay } from '@/components/cycles/cycle-utils';
import { isDateString } from '@/lib/dates';

export const FREQUENCIES = ['daily', 'weekly', 'monthly'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

export const INTERVAL_MAX: Record<Frequency, number> = { daily: 30, weekly: 12, monthly: 12 };
export const DUE_IN_DAYS_MAX = 365;

export interface RecurringSchedule {
  freq: Frequency;
  /** Every N days / weeks / months. */
  interval: number;
  /** Weekly: 0 = Sunday … 6 = Saturday, at least one. */
  weekdays?: number[];
  /** Monthly: 1–31; shorter months use their last day. */
  dayOfMonth?: number;
  /** First possible day, YYYY-MM-DD (UTC). */
  start: string;
}

/** Properties new issues start with (ids re-checked on every run). */
export interface RecurringDefaults {
  stateId?: string;
  priority?: string;
  assigneeId?: string | null;
  labelIds?: string[];
  estimate?: number | null;
  /** Due date = the run's day + N days; absent = no due date. */
  dueInDays?: number | null;
}

/** A schedule as the settings page renders it. */
export interface RecurringIssue {
  id: string;
  title: string;
  description: string;
  data: RecurringDefaults;
  schedule: RecurringSchedule;
  /** The stored schedule couldn't be read (the row is paused). */
  broken: boolean;
  nextRunAt: Date;
  lastRunAt: Date | null;
  enabled: boolean;
}

type Result = { ok: true; schedule: RecurringSchedule } | { ok: false; error: string };

export function normalizeSchedule(raw: unknown): Result {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Invalid schedule.' };
  const input = raw as Record<string, unknown>;
  const freq = input.freq;
  if (!(FREQUENCIES as readonly unknown[]).includes(freq)) {
    return { ok: false, error: 'Choose how often it repeats.' };
  }
  const f = freq as Frequency;
  const interval = input.interval;
  if (!Number.isInteger(interval) || (interval as number) < 1 || (interval as number) > INTERVAL_MAX[f]) {
    return { ok: false, error: `Repeat every 1 to ${INTERVAL_MAX[f]}.` };
  }
  if (!isDateString(input.start)) return { ok: false, error: 'Choose a start date.' };
  const schedule: RecurringSchedule = { freq: f, interval: interval as number, start: input.start };
  if (f === 'weekly') {
    const days = Array.isArray(input.weekdays) ? input.weekdays : [];
    const weekdays = [...new Set(days)].filter(
      (d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6,
    );
    if (weekdays.length === 0 || weekdays.length !== days.length) {
      return { ok: false, error: 'Pick at least one weekday.' };
    }
    schedule.weekdays = weekdays.sort((a, b) => a - b);
  }
  if (f === 'monthly') {
    const day = input.dayOfMonth;
    if (!Number.isInteger(day) || (day as number) < 1 || (day as number) > 31) {
      return { ok: false, error: 'Pick a day of the month.' };
    }
    schedule.dayOfMonth = day as number;
  }
  return { ok: true, schedule };
}

export function sameSchedule(a: RecurringSchedule, b: RecurringSchedule): boolean {
  return (
    a.freq === b.freq &&
    a.interval === b.interval &&
    a.start === b.start &&
    (a.weekdays ?? []).join() === (b.weekdays ?? []).join() &&
    (a.dayOfMonth ?? null) === (b.dayOfMonth ?? null)
  );
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Monday-based week index, so "every 2 weeks" pairs Mon–Sun weeks. */
function weekIndex(day: number): number {
  return Math.floor((day / DAY_MS + 3) / 7);
}

/**
 * Weekly cadences count weeks from the first week that has a chosen weekday
 * on or after the start, so "every 2 weeks on Mon" starting on a Wednesday
 * runs the following Monday, not twelve days later.
 */
function firstWeek(schedule: RecurringSchedule, start: number): number {
  const days = schedule.weekdays ?? [];
  let day = start;
  while (!days.includes(new Date(day).getUTCDay()) && day < start + 7 * DAY_MS) day += DAY_MS;
  return weekIndex(day);
}

function matches(schedule: RecurringSchedule, day: number, start: number, week: number): boolean {
  const d = new Date(day);
  switch (schedule.freq) {
    case 'daily':
      return Math.round((day - start) / DAY_MS) % schedule.interval === 0;
    case 'weekly':
      return (
        (schedule.weekdays ?? []).includes(d.getUTCDay()) &&
        (weekIndex(day) - week) % schedule.interval === 0
      );
    case 'monthly': {
      const s = new Date(start);
      const months =
        d.getUTCFullYear() * 12 + d.getUTCMonth() - (s.getUTCFullYear() * 12 + s.getUTCMonth());
      const target = Math.min(schedule.dayOfMonth ?? 1, daysInMonth(d.getUTCFullYear(), d.getUTCMonth()));
      return months % schedule.interval === 0 && d.getUTCDate() === target;
    }
  }
}

/** Longest gap between occurrences (12 months + a month's slack). */
const SEARCH_DAYS = 400;

/** 00:00Z of the first occurrence on or after `from` (never before `start`); null if none. */
export function nextOccurrence(schedule: RecurringSchedule, from: Date | number): Date | null {
  const start = fromDateInput(schedule.start).getTime();
  const week = schedule.freq === 'weekly' ? firstWeek(schedule, start) : 0;
  let day = Math.max(utcDay(from).getTime(), start);
  for (let i = 0; i < SEARCH_DAYS; i++, day += DAY_MS) {
    if (matches(schedule, day, start, week)) return new Date(day);
  }
  return null;
}

/** The next `count` occurrences on or after `from`. */
export function upcomingRuns(schedule: RecurringSchedule, from: Date | number, count: number): Date[] {
  const runs: Date[] = [];
  let cursor: Date | number = from;
  while (runs.length < count) {
    const next = nextOccurrence(schedule, cursor);
    if (!next) break;
    runs.push(next);
    cursor = next.getTime() + DAY_MS;
  }
  return runs;
}

const SHORT_WEEKDAYS = WEEKDAYS.map((day) => day.slice(0, 3));

function ordinal(n: number): string {
  const suffix = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

/** "Every day", "Every 2 weeks on Mon, Thu", "Monthly on the 31st". */
export function describeSchedule(schedule: RecurringSchedule): string {
  const n = schedule.interval;
  switch (schedule.freq) {
    case 'daily':
      return n === 1 ? 'Every day' : `Every ${n} days`;
    case 'weekly': {
      const days = (schedule.weekdays ?? []).map((d) => SHORT_WEEKDAYS[d]).join(', ');
      const weekdaysOnly = (schedule.weekdays ?? []).join() === '1,2,3,4,5';
      if (n === 1 && weekdaysOnly) return 'Every weekday';
      return `${n === 1 ? 'Weekly' : `Every ${n} weeks`} on ${days}`;
    }
    case 'monthly': {
      const day = ordinal(schedule.dayOfMonth ?? 1);
      return `${n === 1 ? 'Monthly' : `Every ${n} months`} on the ${day}`;
    }
  }
}

/** "Mon, Oct 6" (UTC day). */
export function formatRunDay(date: Date | number): string {
  return formatWeekday(date);
}
