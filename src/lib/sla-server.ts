// The SLA deadline rule in one place: policy hours after the clock starts. The
// TS form stamps single issues (issue service); the SQL forms recompute or
// compare it in bulk (policy changes, search, the breach cron). Server-only.

import { and, isNotNull, lte, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { tickets } from '@/db/schema';
import { HOUR_MS } from '@/lib/time';

/** Deadline from a project's SLA policy ({ priority: hours }); null when none applies. */
export function slaDeadline(
  policy: Record<string, number> | null | undefined,
  priority: string,
  from: Date,
): Date | null {
  const hours = policy?.[priority];
  return typeof hours === 'number' && hours > 0 ? new Date(from.getTime() + hours * HOUR_MS) : null;
}

/** `slaDeadline` as SQL: `from` (a timestamp column or expression) plus `hours`. */
export function slaDeadlineSql(from: AnyPgColumn | SQL, hours: number): SQL {
  return sql`${from} + make_interval(hours => ${hours}::int)`;
}

/** The ticket's SLA deadline has passed at `now` (callers add the open-state scope). */
export function slaPastDue(now: Date): SQL {
  return and(isNotNull(tickets.slaDueAt), lte(tickets.slaDueAt, now))!;
}
