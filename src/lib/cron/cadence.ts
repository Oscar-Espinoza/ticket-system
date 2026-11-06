// Cadence rules shared by the digest and pulse jobs.

import { HOUR_MS, WEEK_MS } from '@/lib/time';

/** Cron start times drift by minutes; this margin keeps a weekly cadence from skipping a week. */
export const WEEKLY_MIN_GAP_MS = WEEK_MS - 4 * HOUR_MS;

/** Weekly jobs start on Mondays (UTC). */
export const isMondayUtc = (now: Date) => now.getUTCDay() === 1;
