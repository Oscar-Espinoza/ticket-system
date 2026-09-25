// Pulse: what happened in a set of projects over a window — epic updates
// (with the health they moved from), issues created and completed. Used by
// the weekly `pulse` cron job (one notification per member) and the Pulse tab
// on /dashboard/dashboards. Server-only; callers pass projects the user is a
// member of (or, for the cron, every project with members).

import { and, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { epicUpdates, epics, projectMembers, projects, tickets, users } from '@/db/schema';
import { stripMentions } from '@/lib/mentions';

export type PulseHealth = 'on_track' | 'at_risk' | 'off_track';

export interface PulseUpdate {
  id: string;
  epicId: string;
  epicName: string;
  epicColor: string | null;
  projectId: string;
  projectName: string;
  projectKey: string;
  health: PulseHealth;
  /** Health of the epic's previous update (null = first update). */
  previousHealth: PulseHealth | null;
  excerpt: string;
  authorName: string | null;
  authorImage: string | null;
  createdAt: Date;
}

export interface PulseProjectStats {
  projectId: string;
  projectName: string;
  projectKey: string;
  created: number;
  completed: number;
  updates: number;
}

export interface Pulse {
  from: Date;
  to: Date;
  projects: PulseProjectStats[];
  updates: PulseUpdate[];
}

const EXCERPT = 280;

function excerpt(body: string): string {
  const text = stripMentions(body)
    .replace(/[#>*_`~[\]()!]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > EXCERPT ? `${text.slice(0, EXCERPT - 1)}…` : text;
}

/** Activity in `projectIds` between `from` (inclusive) and `to` (exclusive). */
export async function getPulse(
  projectIds: string[],
  from: Date,
  to: Date,
  opts: { updateLimit?: number } = {},
): Promise<Pulse> {
  if (projectIds.length === 0) return { from, to, projects: [], updates: [] };

  // lag() must see updates before the window, so rank first, then filter.
  const ranked = db
    .select({
      id: epicUpdates.id,
      epicId: epicUpdates.epicId,
      health: epicUpdates.health,
      body: epicUpdates.body,
      authorId: epicUpdates.authorId,
      createdAt: epicUpdates.createdAt,
      previousHealth:
        sql<PulseHealth | null>`lag(${epicUpdates.health}) over (partition by ${epicUpdates.epicId} order by ${epicUpdates.createdAt})`.as(
          'previous_health',
        ),
    })
    .from(epicUpdates)
    .innerJoin(epics, eq(epicUpdates.epicId, epics.id))
    .where(and(inArray(epics.projectId, projectIds), lt(epicUpdates.createdAt, to)))
    .as('ranked');

  const [updateRows, projectRows, createdRows, completedRows] = await db.batch([
    db
      .select({
        id: ranked.id,
        epicId: ranked.epicId,
        epicName: epics.name,
        epicColor: epics.color,
        projectId: projects.id,
        projectName: projects.name,
        projectKey: projects.ticketKey,
        health: ranked.health,
        previousHealth: ranked.previousHealth,
        body: ranked.body,
        authorName: users.name,
        authorImage: users.image,
        createdAt: ranked.createdAt,
      })
      .from(ranked)
      .innerJoin(epics, eq(ranked.epicId, epics.id))
      .innerJoin(projects, eq(epics.projectId, projects.id))
      .leftJoin(users, eq(ranked.authorId, users.id))
      .where(gte(ranked.createdAt, from))
      .orderBy(desc(ranked.createdAt))
      .limit(opts.updateLimit ?? 200),
    db
      .select({ id: projects.id, name: projects.name, key: projects.ticketKey })
      .from(projects)
      .where(inArray(projects.id, projectIds)),
    db
      .select({ projectId: tickets.projectId, count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(
        and(
          inArray(tickets.projectId, projectIds),
          isNull(tickets.deletedAt),
          gte(tickets.createdAt, from),
          lt(tickets.createdAt, to),
        ),
      )
      .groupBy(tickets.projectId),
    db
      .select({ projectId: tickets.projectId, count: sql<number>`count(*)::int` })
      .from(tickets)
      .where(
        and(
          inArray(tickets.projectId, projectIds),
          isNull(tickets.deletedAt),
          gte(tickets.completedAt, from),
          lt(tickets.completedAt, to),
        ),
      )
      .groupBy(tickets.projectId),
  ]);

  const created = new Map(createdRows.map((r) => [r.projectId, Number(r.count)]));
  const completed = new Map(completedRows.map((r) => [r.projectId, Number(r.count)]));
  const updates: PulseUpdate[] = updateRows.map(({ body, ...row }) => ({
    ...row,
    health: row.health as PulseHealth,
    previousHealth: (row.previousHealth ?? null) as PulseHealth | null,
    excerpt: excerpt(body),
  }));
  const updateCount = new Map<string, number>();
  for (const update of updates) updateCount.set(update.projectId, (updateCount.get(update.projectId) ?? 0) + 1);

  return {
    from,
    to,
    projects: projectRows
      .map((p) => ({
        projectId: p.id,
        projectName: p.name,
        projectKey: p.key,
        created: created.get(p.id) ?? 0,
        completed: completed.get(p.id) ?? 0,
        updates: updateCount.get(p.id) ?? 0,
      }))
      .sort((a, b) => b.completed + b.created + b.updates - (a.completed + a.created + a.updates)),
    updates,
  };
}

/** The Pulse tab: the viewer's projects, last `days` days of updates + this week's counts. */
export async function getPulseFeed(userId: string, days = 30, now = new Date()): Promise<Pulse & { weekFrom: Date }> {
  const memberships = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, userId));
  const ids = memberships.map((m) => m.projectId);
  const from = new Date(now.getTime() - days * 86_400_000);
  const weekFrom = new Date(now.getTime() - 7 * 86_400_000);
  const [feed, week] = await Promise.all([
    getPulse(ids, from, now, { updateLimit: 100 }),
    getPulse(ids, weekFrom, now, { updateLimit: 0 }),
  ]);
  return { ...feed, projects: week.projects, weekFrom };
}

export const HEALTH_WORD: Record<PulseHealth, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  off_track: 'Off track',
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Notification text for one member's pulse. */
export function describePulse(stats: PulseProjectStats[], updates: PulseUpdate[]): { summary: string; lines: string[] } {
  const completed = stats.reduce((sum, s) => sum + s.completed, 0);
  const created = stats.reduce((sum, s) => sum + s.created, 0);
  const parts = [
    updates.length ? plural(updates.length, 'epic update') : null,
    `${completed} completed`,
    `${created} created`,
  ].filter(Boolean);
  const summary = `${parts.join(' · ')}${stats.length > 1 ? ` across ${stats.length} projects` : ''}`;

  const lines = stats.slice(0, 8).map((s) => {
    const bits = [`${s.completed} completed`, `${s.created} created`];
    if (s.updates) bits.push(plural(s.updates, 'update'));
    return `${s.projectName}: ${bits.join(', ')}`;
  });
  for (const update of updates.slice(0, 5)) {
    const moved =
      update.previousHealth && update.previousHealth !== update.health
        ? `${HEALTH_WORD[update.previousHealth]} → ${HEALTH_WORD[update.health]}`
        : HEALTH_WORD[update.health];
    lines.push(`${update.epicName} (${update.projectKey}): ${moved}`);
  }
  return { summary, lines };
}
