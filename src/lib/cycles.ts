// Cycle reads, scheduling and history (server only). NO AUTHORIZATION here —
// callers (actions, pages under the membership-checked project layout, the
// automation runner) authorize first. Every query is scoped by projectId.
//
// Stats are rebuilt from history instead of the live `cycle_id` column alone:
// rolled-over issues leave a cycle when it completes, but they still belong to
// its scope, burndown and velocity. Membership intervals come from the
// `issue.updated` activity rows whose changes include a `cycleId` change.

import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  max,
  ne,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';

import { db } from '@/lib/db';
import { activities, cycles, projects, tickets, workflowStates } from '@/db/schema';
import { bulkUpdate, BULK_MAX, type IssueActor } from '@/lib/issue-service';
import {
  DAY_MS,
  EMPTY_TOTALS,
  MAX_COOLDOWN_WEEKS,
  UPCOMING_CYCLES,
  alignOnOrAfter,
  alignOnOrBefore,
  utcDay,
  type BurndownPoint,
  type CycleTotals,
} from '@/components/cycles/cycle-utils';

export type CycleRow = typeof cycles.$inferSelect;

const WEEK_MS = 7 * DAY_MS;
/** Cap on the cycle-change history read per project (newest kept). */
const HISTORY_LIMIT = 5000;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** All cycles of a project, oldest first. */
export function getProjectCycles(projectId: string): Promise<CycleRow[]> {
  return db
    .select()
    .from(cycles)
    .where(eq(cycles.projectId, projectId))
    .orderBy(asc(cycles.startsAt), asc(cycles.number));
}

export async function getCycle(projectId: string, cycleId: string): Promise<CycleRow | null> {
  if (!projectId || !cycleId) return null;
  const [row] = await db
    .select()
    .from(cycles)
    .where(and(eq(cycles.projectId, projectId), eq(cycles.id, cycleId)))
    .limit(1);
  return row ?? null;
}

export function isCurrentCycle(row: CycleRow, now: Date): boolean {
  return !row.completedAt && row.startsAt <= now && now < row.endsAt;
}

/** Any cycle other than `exceptId` overlapping [startsAt, endsAt)? */
export async function findOverlappingCycle(
  projectId: string,
  startsAt: Date,
  endsAt: Date,
  exceptId?: string,
): Promise<CycleRow | null> {
  const [row] = await db
    .select()
    .from(cycles)
    .where(
      and(
        eq(cycles.projectId, projectId),
        lt(cycles.startsAt, endsAt),
        gt(cycles.endsAt, startsAt),
        exceptId ? ne(cycles.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Insert cycles with the next free numbers. Unique (project, number) is the race backstop. */
export async function insertCycles(
  projectId: string,
  slots: { startsAt: Date; endsAt: Date; name?: string | null; description?: string | null }[],
): Promise<CycleRow[]> {
  if (slots.length === 0) return [];
  const [{ top }] = await db
    .select({ top: max(cycles.number) })
    .from(cycles)
    .where(eq(cycles.projectId, projectId));
  const now = new Date();
  const values = slots.map((slot, i) => ({
    id: crypto.randomUUID(),
    projectId,
    number: (top ?? 0) + i + 1,
    name: slot.name ?? null,
    description: slot.description ?? null,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    completedAt: null,
    createdAt: now,
  }));
  return db.insert(cycles).values(values).returning();
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

/**
 * Keep a current cycle and UPCOMING_CYCLES upcoming ones scheduled. While a
 * cycle is open the cadence continues from the latest cycle's end (weekday
 * changes re-lay those through rescheduleUpcomingCycles); otherwise a fresh
 * cadence starts on the most recent `weekday` (project.cycle_start_weekday).
 * Gaps (nobody opened the project for weeks) are skipped whole-cycle, so no
 * empty past cycles are created. Consecutive cycles are `cooldownWeeks` apart
 * (project.cycle_cooldown_weeks, read when not passed).
 */
export async function ensureUpcomingCycles(
  projectId: string,
  durationWeeks: number,
  now: Date,
  weekday: number,
  cooldownWeeks?: number,
): Promise<CycleRow[]> {
  const [rows, cooldownRaw] = await Promise.all([
    getProjectCycles(projectId),
    cooldownWeeks ?? getCooldownWeeks(projectId),
  ]);
  const duration = clampWeeks(durationWeeks) * WEEK_MS;
  const cooldown = clampCooldown(cooldownRaw) * WEEK_MS;
  const period = duration + cooldown;
  const t = now.getTime();

  const lastEnd = rows.length ? Math.max(...rows.map((row) => row.endsAt.getTime())) : null;
  const hasOpen = rows.some((row) => !row.completedAt && row.endsAt.getTime() > t);
  let cursor: number;
  if (lastEnd !== null && hasOpen) {
    cursor = lastEnd + cooldown;
  } else {
    // Fresh cadence: no cycles yet, or every cycle is over.
    cursor = alignOnOrBefore(now, weekday).getTime();
    if (lastEnd !== null && cursor < lastEnd + cooldown) {
      cursor = alignOnOrAfter(lastEnd + cooldown, weekday).getTime();
    }
  }
  if (cursor + duration <= t) {
    cursor += Math.floor((t - cursor) / period) * period;
    // Landed inside a cooldown: the next cycle starts after it.
    if (cursor + duration <= t) cursor += period;
  }

  const slots: { startsAt: Date; endsAt: Date }[] = [];
  const push = () => {
    slots.push({ startsAt: new Date(cursor), endsAt: new Date(cursor + duration) });
    cursor += period;
  };
  if (cursor <= t && !rows.some((row) => isCurrentCycle(row, now))) push();
  let upcoming = rows.filter((row) => !row.completedAt && row.startsAt.getTime() > t).length;
  while (upcoming < UPCOMING_CYCLES) {
    push();
    upcoming++;
  }
  return insertCycles(projectId, slots);
}

/**
 * Re-lay the cycles that haven't started yet after a duration / weekday /
 * cooldown change: from the current cycle's end (moved forward to the chosen
 * weekday when needed — at most 6 extra days) plus the cooldown, else from the
 * next `weekday` that also respects the last cycle's cooldown.
 */
export async function rescheduleUpcomingCycles(
  projectId: string,
  durationWeeks: number,
  weekday: number,
  now: Date = new Date(),
  cooldownWeeks = 0,
): Promise<void> {
  const rows = await getProjectCycles(projectId);
  const duration = clampWeeks(durationWeeks) * WEEK_MS;
  const cooldown = clampCooldown(cooldownWeeks) * WEEK_MS;
  const current = rows.find((row) => isCurrentCycle(row, now));
  const upcoming = rows.filter((row) => !row.completedAt && row.startsAt > now);

  const statements: BatchItem<'pg'>[] = [];
  let anchor: number;
  if (current) {
    const end = alignOnOrAfter(current.endsAt, weekday).getTime();
    if (end !== current.endsAt.getTime()) {
      statements.push(
        db
          .update(cycles)
          .set({ endsAt: new Date(end) })
          .where(and(eq(cycles.id, current.id), eq(cycles.projectId, projectId))),
      );
    }
    anchor = end + cooldown;
  } else {
    anchor = alignOnOrAfter(utcDay(now).getTime() + DAY_MS, weekday).getTime();
    const started = rows.filter((row) => row.startsAt <= now);
    if (started.length && cooldown > 0) {
      const lastEnd = Math.max(...started.map((row) => row.endsAt.getTime()));
      if (lastEnd + cooldown > anchor) anchor = alignOnOrAfter(lastEnd + cooldown, weekday).getTime();
    }
  }

  upcoming.forEach((row, i) => {
    const startsAt = new Date(anchor + i * (duration + cooldown));
    const endsAt = new Date(startsAt.getTime() + duration);
    if (startsAt.getTime() === row.startsAt.getTime() && endsAt.getTime() === row.endsAt.getTime()) {
      return;
    }
    statements.push(
      db
        .update(cycles)
        .set({ startsAt, endsAt })
        .where(and(eq(cycles.id, row.id), eq(cycles.projectId, projectId))),
    );
  });
  if (statements.length) await db.batch(statements as [BatchItem<'pg'>, ...BatchItem<'pg'>[]]);
}

async function getCooldownWeeks(projectId: string): Promise<number> {
  const [row] = await db
    .select({ weeks: projects.cycleCooldownWeeks })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return row?.weeks ?? 0;
}

function clampCooldown(weeks: number): number {
  return Math.min(MAX_COOLDOWN_WEEKS, Math.max(0, Math.round(weeks) || 0));
}

function clampWeeks(weeks: number): number {
  return Math.min(8, Math.max(1, Math.round(weeks) || 2));
}

// ---------------------------------------------------------------------------
// Completion + rollover
// ---------------------------------------------------------------------------

/** The cycle unfinished issues roll into: the earliest open cycle after `cycle`. */
export async function findNextCycle(projectId: string, cycle: CycleRow): Promise<CycleRow | null> {
  const [row] = await db
    .select()
    .from(cycles)
    .where(
      and(
        eq(cycles.projectId, projectId),
        isNull(cycles.completedAt),
        ne(cycles.id, cycle.id),
        gte(cycles.startsAt, cycle.startsAt),
      ),
    )
    .orderBy(asc(cycles.startsAt))
    .limit(1);
  return row ?? null;
}

export type CompleteCycleResult =
  | { ok: true; moved: number; next: CycleRow | null }
  | { ok: false; error: string };

/**
 * Mark a cycle completed; with `rollover`, move its unfinished (not completed /
 * canceled, not archived / deleted) issues into the next open cycle through the
 * issue service, so each move lands in activity like any other edit.
 */
export async function completeCycle(
  actor: IssueActor,
  projectId: string,
  cycleId: string,
  { completedAt, rollover }: { completedAt: Date; rollover: boolean },
): Promise<CompleteCycleResult> {
  const [cycle] = await db
    .update(cycles)
    .set({ completedAt })
    .where(and(eq(cycles.id, cycleId), eq(cycles.projectId, projectId), isNull(cycles.completedAt)))
    .returning();
  if (!cycle) return { ok: false, error: 'Cycle not found or already completed.' };
  if (!rollover) return { ok: true, moved: 0, next: null };

  const next = await findNextCycle(projectId, cycle);
  if (!next) return { ok: true, moved: 0, next: null };

  const unfinished = await db
    .select({ id: tickets.id })
    .from(tickets)
    .innerJoin(workflowStates, eq(tickets.stateId, workflowStates.id))
    .where(
      and(
        eq(tickets.projectId, projectId),
        eq(tickets.cycleId, cycle.id),
        isNull(tickets.archivedAt),
        isNull(tickets.deletedAt),
        notInArray(workflowStates.type, ['completed', 'canceled']),
      ),
    );
  let moved = 0;
  for (let i = 0; i < unfinished.length; i += BULK_MAX) {
    const ids = unfinished.slice(i, i + BULK_MAX).map((row) => row.id);
    const result = await bulkUpdate(actor, projectId, ids, { cycleId: next.id });
    if (!result.ok) {
      console.error('[cycles] rollover failed', cycle.id, result.error);
      break;
    }
    moved += ids.length;
  }
  return { ok: true, moved, next };
}

/**
 * Automation: complete every cycle whose end has passed (completedAt = its
 * end). `rollover` = project.cycle_auto_rollover: move unfinished issues into
 * the next cycle, or leave them in the completed one.
 */
export async function completeEndedCycles(
  actor: IssueActor,
  projectId: string,
  now: Date,
  { rollover }: { rollover: boolean },
): Promise<void> {
  const ended = await db
    .select({ id: cycles.id, endsAt: cycles.endsAt })
    .from(cycles)
    .where(
      and(
        eq(cycles.projectId, projectId),
        isNull(cycles.completedAt),
        lte(cycles.endsAt, now),
      ),
    )
    .orderBy(asc(cycles.startsAt));
  for (const cycle of ended) {
    const result = await completeCycle(actor, projectId, cycle.id, {
      completedAt: cycle.endsAt,
      rollover,
    });
    if (!result.ok) console.error('[cycles] complete failed', cycle.id, result.error);
  }
}

// ---------------------------------------------------------------------------
// History → totals, burndown, velocity
// ---------------------------------------------------------------------------

interface HistoryIssue {
  id: string;
  cycleId: string | null;
  estimate: number | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  canceledAt: Date | null;
}

interface CycleMove {
  ticketId: string;
  at: Date;
  from: string | null;
  to: string | null;
}

export interface CycleHistory {
  issues: HistoryIssue[];
  /** Per ticket, oldest first. */
  moves: Map<string, CycleMove[]>;
}

function refId(value: unknown): string | null {
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id: unknown }).id;
    return typeof id === 'string' ? id : null;
  }
  return null;
}

/**
 * Every non-deleted issue that is, or ever was, in a cycle of the project, plus
 * their cycle moves. ONE round trip.
 */
export async function loadCycleHistory(projectId: string): Promise<CycleHistory> {
  const cycleChange = and(
    eq(activities.projectId, projectId),
    eq(activities.type, 'issue.updated'),
    isNotNull(activities.ticketId),
    sql`${activities.data} @> ${JSON.stringify({ changes: [{ field: 'cycleId' }] })}::jsonb`,
  );
  const [moveRows, issueRows] = await db.batch([
    db
      .select({ ticketId: activities.ticketId, data: activities.data, at: activities.createdAt })
      .from(activities)
      .where(cycleChange)
      .orderBy(desc(activities.createdAt))
      .limit(HISTORY_LIMIT),
    db
      .select({
        id: tickets.id,
        cycleId: tickets.cycleId,
        estimate: tickets.estimate,
        createdAt: tickets.createdAt,
        startedAt: tickets.startedAt,
        completedAt: tickets.completedAt,
        canceledAt: tickets.canceledAt,
      })
      .from(tickets)
      .where(
        and(
          eq(tickets.projectId, projectId),
          isNull(tickets.deletedAt),
          or(
            isNotNull(tickets.cycleId),
            inArray(
              tickets.id,
              db
                .select({ id: sql<string>`${activities.ticketId}` })
                .from(activities)
                .where(cycleChange),
            ),
          ),
        ),
      ),
  ]);

  const moves = new Map<string, CycleMove[]>();
  for (const row of moveRows.reverse()) {
    if (!row.ticketId) continue;
    const changes = Array.isArray(row.data.changes) ? row.data.changes : [];
    const change = changes.find(
      (c): c is { field: string; from: unknown; to: unknown } =>
        !!c && typeof c === 'object' && (c as { field?: unknown }).field === 'cycleId',
    );
    if (!change) continue;
    const move = { ticketId: row.ticketId, at: row.at, from: refId(change.from), to: refId(change.to) };
    const list = moves.get(row.ticketId);
    if (list) list.push(move);
    else moves.set(row.ticketId, [move]);
  }
  return { issues: issueRows, moves };
}

type Interval = [start: number, end: number];

/** When each issue was in `cycleId` (ms intervals; open end = Infinity). */
function membership(history: CycleHistory, cycleId: string): Map<HistoryIssue, Interval[]> {
  const result = new Map<HistoryIssue, Interval[]>();
  for (const issue of history.issues) {
    const moves = (history.moves.get(issue.id) ?? []).filter(
      (m) => m.from === cycleId || m.to === cycleId,
    );
    const intervals: Interval[] = [];
    if (moves.length === 0) {
      if (issue.cycleId === cycleId) intervals.push([issue.createdAt.getTime(), Infinity]);
    } else {
      // No "moved in" before the first "moved out" → it was created in the cycle.
      let since: number | null = moves[0].from === cycleId ? issue.createdAt.getTime() : null;
      for (const move of moves) {
        const at = move.at.getTime();
        if (move.to === cycleId && since === null) since = at;
        else if (move.from === cycleId && since !== null) {
          intervals.push([since, at]);
          since = null;
        }
      }
      if (since !== null) intervals.push([since, Infinity]);
    }
    if (intervals.length) result.set(issue, intervals);
  }
  return result;
}

function totalsAt(members: Map<HistoryIssue, Interval[]>, t: number): CycleTotals {
  const totals = { ...EMPTY_TOTALS };
  for (const [issue, intervals] of members) {
    if (!intervals.some(([start, end]) => start <= t && t < end)) continue;
    // Canceled issues leave the scope; completed ones stay in it (as done).
    if (issue.canceledAt && issue.canceledAt.getTime() <= t) continue;
    const points = issue.estimate ?? 0;
    totals.scope++;
    totals.scopePoints += points;
    if (issue.completedAt && issue.completedAt.getTime() <= t) {
      totals.completed++;
      totals.completedPoints += points;
    } else if (issue.startedAt && issue.startedAt.getTime() <= t) {
      totals.started++;
      totals.startedPoints += points;
    }
  }
  return totals;
}

/** The moment a cycle's numbers are read at: now, or when it ended / was completed. */
export function cycleReadTime(cycle: CycleRow, now: Date = new Date()): number {
  let t = Math.min(now.getTime(), cycle.endsAt.getTime() - 1);
  if (cycle.completedAt) t = Math.min(t, cycle.completedAt.getTime());
  return t;
}

/** Totals at the read time (upcoming cycles: what's planned into them so far). */
export function cycleTotals(
  history: CycleHistory,
  cycle: CycleRow,
  now: Date = new Date(),
): CycleTotals {
  return totalsAt(membership(history, cycle.id), cycleReadTime(cycle, now));
}

/** Start-of-cycle sample, then one per elapsed day (the current day read at `now`). */
export function cycleBurndown(
  history: CycleHistory,
  cycle: CycleRow,
  now: Date = new Date(),
): BurndownPoint[] {
  const members = membership(history, cycle.id);
  const start = cycle.startsAt.getTime();
  const limit = cycleReadTime(cycle, now);
  const days = Math.max(1, Math.round((cycle.endsAt.getTime() - start) / DAY_MS));
  const points: BurndownPoint[] = [];
  if (start > now.getTime()) return points;
  points.push({ at: cycle.startsAt, day: null, totals: totalsAt(members, start) });
  for (let i = 1; i <= days; i++) {
    const dayStart = start + (i - 1) * DAY_MS;
    if (dayStart > limit) break;
    const at = Math.min(start + i * DAY_MS - 1, limit);
    points.push({ at: new Date(at), day: new Date(dayStart), totals: totalsAt(members, at) });
  }
  return points;
}
