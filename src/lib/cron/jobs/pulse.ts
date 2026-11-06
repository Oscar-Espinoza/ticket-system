// Daily cron job. Weekly Pulse: one inbox notification per
// project member summarising the last 7 days (epic updates + health changes,
// issues created / completed) of their projects with activity.
//
// Due per user: Monday (UTC) with no pulse in the last 6 days, or 7+ days since
// their last pulse (a missed Monday). A user's first pulse waits for a Monday.
// Idempotent: the last pulse is read back from `notification`, so a retried run
// the same day finds it and skips. Never throws past its own try/catch.

import { eq, max } from 'drizzle-orm';

import { db } from '@/lib/db';
import { notifications, projectMembers, userProfiles } from '@/db/schema';
import { isMondayUtc, WEEKLY_MIN_GAP_MS } from '@/lib/cron/cadence';
import type { ChannelNotification } from '@/lib/notifications/channels';
import { createNotifications } from '@/lib/notifications/create';
import { prefEnabled } from '@/lib/notifications/types';
import { DAY_MS } from '@/lib/time';
import { describePulse, getPulse, type PulseProjectStats } from '@/lib/pulse';

const PULSE_URL = '/dashboard/dashboards?tab=pulse';

export async function run(now: Date): Promise<string> {
  try {
    return await sendPulses(now);
  } catch (err) {
    console.error('[cron] pulse failed', err);
    return `error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function sendPulses(now: Date): Promise<string> {
  const isMonday = isMondayUtc(now);

  const [memberships, lastPulses, profiles] = await db.batch([
    db.select({ userId: projectMembers.userId, projectId: projectMembers.projectId }).from(projectMembers),
    db
      .select({ userId: notifications.userId, at: max(notifications.createdAt) })
      .from(notifications)
      .where(eq(notifications.type, 'pulse'))
      .groupBy(notifications.userId),
    db.select({ userId: userProfiles.userId, prefs: userProfiles.notificationPrefs }).from(userProfiles),
  ]);

  const last = new Map(lastPulses.flatMap((r) => (r.at ? [[r.userId, new Date(r.at).getTime()] as const] : [])));
  const prefs = new Map(profiles.map((p) => [p.userId, p.prefs]));
  const projectsByUser = new Map<string, string[]>();
  for (const m of memberships) {
    const list = projectsByUser.get(m.userId) ?? [];
    list.push(m.projectId);
    projectsByUser.set(m.userId, list);
  }

  const due = [...projectsByUser.keys()].filter((userId) => {
    if (!prefEnabled(prefs.get(userId), 'pulse')) return false;
    const previous = last.get(userId);
    if (previous === undefined) return isMonday;
    const age = now.getTime() - previous;
    return age >= WEEKLY_MIN_GAP_MS || (isMonday && age >= 6 * DAY_MS);
  });
  if (due.length === 0) return 'no users due';

  const projectIds = [...new Set(due.flatMap((userId) => projectsByUser.get(userId)!))];
  const from = new Date(now.getTime() - 7 * DAY_MS);
  const pulse = await getPulse(projectIds, from, now, { updateLimit: 1000 });
  const statsById = new Map(pulse.projects.map((p) => [p.projectId, p]));

  const rows: ChannelNotification[] = [];
  for (const userId of due) {
    const mine = new Set(projectsByUser.get(userId));
    const stats: PulseProjectStats[] = [];
    for (const id of mine) {
      const s = statsById.get(id);
      if (s && s.created + s.completed + s.updates > 0) stats.push(s);
    }
    stats.sort((a, b) => b.completed + b.created + b.updates - (a.completed + a.created + a.updates));
    if (stats.length === 0) continue;
    const updates = pulse.updates.filter((u) => mine.has(u.projectId));
    const { summary, lines } = describePulse(stats, updates);
    rows.push({
      id: crypto.randomUUID(),
      userId,
      projectId: stats.length === 1 ? stats[0].projectId : null,
      ticketId: null,
      actorId: null,
      type: 'pulse',
      data: {
        title: 'Weekly pulse',
        summary,
        lines,
        url: PULSE_URL,
        from: from.toISOString(),
        to: now.toISOString(),
        projects: stats.map((s) => ({
          id: s.projectId,
          name: s.projectName,
          key: s.projectKey,
          created: s.created,
          completed: s.completed,
          updates: s.updates,
        })),
        updates: updates.slice(0, 10).map((u) => ({
          epicId: u.epicId,
          epicName: u.epicName,
          projectId: u.projectId,
          health: u.health,
          previousHealth: u.previousHealth,
          author: u.authorName,
        })),
      },
      createdAt: now,
    });
  }
  if (rows.length === 0) return `${due.length} due, no activity`;

  const sent = await createNotifications(rows);
  return `sent ${sent.length} pulse${sent.length === 1 ? '' : 's'}`;
}
