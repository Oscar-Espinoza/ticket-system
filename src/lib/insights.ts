// Project insights: flow (created vs completed per week), backlog shape (open
// issues by state / priority / assignee / label) and speed (cycle + lead time).
// All aggregation happens in SQL, in ONE db.batch round trip.
//
// Does NOT authorize — callers check membership first (the insights page does).
// Deleted issues never count; archived ones count as history but not as "open".

import { and, desc, eq, exists, gte, inArray, isNull, notInArray, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { db } from '@/lib/db';
import { issueLabels, labels, tickets, users, workflowStates } from '@/db/schema';
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

const HOUR = 3600;
/** Upper bounds in hours; the last bucket is open-ended. */
const BUCKETS: { label: string; maxHours: number }[] = [
  { label: '< 1 day', maxHours: 24 },
  { label: '1–3 days', maxHours: 72 },
  { label: '3–7 days', maxHours: 168 },
  { label: '1–2 weeks', maxHours: 336 },
  { label: '2–4 weeks', maxHours: 672 },
  { label: '> 4 weeks', maxHours: Infinity },
];

const PRIORITY_ORDER: Priority[] = ['urgent', 'high', 'medium', 'low', 'none'];

/** Monday 00:00 UTC, `weeks - 1` weeks before this one. */
function rangeStart(weeks: number, now = new Date()): Date {
  const day = (now.getUTCDay() + 6) % 7;
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day - (weeks - 1) * 7),
  );
}

const weekOf = (column: AnyPgColumn) =>
  sql<string>`to_char(date_trunc('week', ${column}), 'YYYY-MM-DD')`;
const count = sql<number>`count(*)::int`;

/** Median + bucket counts of `seconds` over the rows matching `filter`. */
function durationColumns(prefix: string, seconds: SQL, filter: SQL) {
  const columns: Record<string, SQL<number | null>> = {
    [`${prefix}Count`]: sql<number>`count(*) filter (where ${filter})::int`,
    [`${prefix}Median`]: sql<number | null>`percentile_cont(0.5) within group (order by ${seconds}) filter (where ${filter})`,
  };
  let lower = 0;
  BUCKETS.forEach((bucket, i) => {
    const upper = bucket.maxHours === Infinity ? sql`true` : sql`${seconds} < ${bucket.maxHours * HOUR}`;
    columns[`${prefix}B${i}`] = sql<number>`count(*) filter (where ${filter} and ${seconds} >= ${lower * HOUR} and ${upper})::int`;
    lower = bucket.maxHours;
  });
  return columns;
}

function toDistribution(row: Record<string, unknown> | undefined, prefix: string): Distribution {
  const median = row?.[`${prefix}Median`];
  return {
    count: Number(row?.[`${prefix}Count`] ?? 0),
    medianHours: median == null ? null : Number(median) / HOUR,
    buckets: BUCKETS.map((b, i) => ({ label: b.label, count: Number(row?.[`${prefix}B${i}`] ?? 0) })),
  };
}

export async function getProjectInsights(
  projectId: string,
  opts: { weeks: InsightRange; labelId?: string | null },
): Promise<ProjectInsights> {
  const start = rangeStart(opts.weeks);
  const base = and(
    eq(tickets.projectId, projectId),
    isNull(tickets.deletedAt),
    opts.labelId
      ? exists(
          db
            .select({ one: sql`1` })
            .from(issueLabels)
            .where(and(eq(issueLabels.ticketId, tickets.id), eq(issueLabels.labelId, opts.labelId))),
        )
      : undefined,
  );
  const openStateIds = db
    .select({ id: workflowStates.id })
    .from(workflowStates)
    .where(
      and(
        eq(workflowStates.projectId, projectId),
        notInArray(workflowStates.type, ['completed', 'canceled']),
      ),
    );
  const open = and(base, isNull(tickets.archivedAt), inArray(tickets.stateId, openStateIds));

  const cycleSeconds = sql`extract(epoch from (${tickets.completedAt} - ${tickets.startedAt}))`;
  const leadSeconds = sql`extract(epoch from (${tickets.completedAt} - ${tickets.createdAt}))`;

  const [created, completed, byState, byPriority, byAssignee, byLabel, durations] = await db.batch([
    db
      .select({ week: weekOf(tickets.createdAt), count })
      .from(tickets)
      .where(and(base, gte(tickets.createdAt, start)))
      .groupBy(sql`1`),
    db
      .select({ week: weekOf(tickets.completedAt), count })
      .from(tickets)
      .where(and(base, gte(tickets.completedAt, start)))
      .groupBy(sql`1`),
    db
      .select({
        id: workflowStates.id,
        label: workflowStates.name,
        color: workflowStates.color,
        stateType: workflowStates.type,
        position: workflowStates.position,
        count,
      })
      .from(tickets)
      .innerJoin(workflowStates, eq(tickets.stateId, workflowStates.id))
      .where(open)
      .groupBy(workflowStates.id),
    db
      .select({ priority: tickets.priority, count })
      .from(tickets)
      .where(open)
      .groupBy(tickets.priority),
    db
      .select({ id: users.id, label: users.name, image: users.image, count })
      .from(tickets)
      .leftJoin(users, eq(tickets.assigneeId, users.id))
      .where(open)
      .groupBy(users.id)
      .orderBy(desc(count)),
    db
      .select({ id: labels.id, label: labels.name, color: labels.color, count })
      .from(tickets)
      .innerJoin(issueLabels, eq(issueLabels.ticketId, tickets.id))
      .innerJoin(labels, eq(issueLabels.labelId, labels.id))
      .where(open)
      .groupBy(labels.id)
      .orderBy(desc(count)),
    db
      .select({
        ...durationColumns('cycle', cycleSeconds, sql`${tickets.startedAt} is not null`),
        ...durationColumns('lead', leadSeconds, sql`true`),
      })
      .from(tickets)
      .where(and(base, gte(tickets.completedAt, start))),
  ]);

  // Every week of the range, zero-filled.
  const createdBy = new Map(created.map((r) => [r.week, Number(r.count)]));
  const completedBy = new Map(completed.map((r) => [r.week, Number(r.count)]));
  const weeks: WeekPoint[] = Array.from({ length: opts.weeks }, (_, i) => {
    const week = new Date(start.getTime() + i * 7 * 86_400_000).toISOString().slice(0, 10);
    return { week, created: createdBy.get(week) ?? 0, completed: completedBy.get(week) ?? 0 };
  });

  const TYPE_ORDER: StateType[] = ['triage', 'backlog', 'unstarted', 'started'];
  const states = byState
    .sort(
      (a, b) =>
        TYPE_ORDER.indexOf(a.stateType) - TYPE_ORDER.indexOf(b.stateType) || a.position - b.position,
    )
    .map((s) => ({ id: s.id, label: s.label, color: s.color, stateType: s.stateType, count: Number(s.count) }));
  const priorityCount = new Map(byPriority.map((r) => [r.priority, Number(r.count)]));

  return {
    weeks,
    totals: {
      open: states.reduce((sum, s) => sum + s.count, 0),
      created: weeks.reduce((sum, w) => sum + w.created, 0),
      completed: weeks.reduce((sum, w) => sum + w.completed, 0),
    },
    byState: states,
    byPriority: PRIORITY_ORDER.filter((p) => priorityCount.has(p)).map((p) => ({
      id: p,
      label: p,
      priority: p,
      count: priorityCount.get(p)!,
    })),
    byAssignee: byAssignee.map((r) => ({
      id: r.id ?? 'unassigned',
      label: r.label ?? 'Unassigned',
      image: r.image,
      count: Number(r.count),
    })),
    byLabel: byLabel.map((r) => ({ id: r.id, label: r.label, color: r.color, count: Number(r.count) })),
    cycleTime: toDistribution(durations[0], 'cycle'),
    leadTime: toDistribution(durations[0], 'lead'),
  };
}
