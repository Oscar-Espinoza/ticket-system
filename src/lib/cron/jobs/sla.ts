// Daily cron job (D5): flag SLA breaches and notify. An open, active issue
// whose `sla_due_at` has passed gets `sla_breached_at` — claimed with a
// conditional update, so a retried run never flags or notifies twice. The
// assignee and subscribers (still project members, type not switched off) get
// an inbox row, then the external channels. Completed / canceled issues never
// breach: their clock stopped.

import { and, eq, inArray, isNotNull, isNull, lte, notInArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  notifications,
  projectMembers,
  projects,
  tickets,
  userProfiles,
  workflowStates,
} from '@/db/schema';
import { emitIssueEvent } from '@/lib/events';
import { deliverToChannels } from '@/lib/notifications/channels';
import { prefEnabled } from '@/lib/notifications/types';
import { getSubscriberIdsByTicket } from '@/lib/subscriptions';

const BATCH = 500;
/** Safety valve: at most this many batches per run (the next run continues). */
const MAX_BATCHES = 10;
const SUMMARY = 'SLA breached';

type NotificationInsert = typeof notifications.$inferInsert;

async function flagBatch(now: Date): Promise<number> {
  const due = await db
    .select({ id: tickets.id })
    .from(tickets)
    .innerJoin(workflowStates, eq(tickets.stateId, workflowStates.id))
    .where(
      and(
        isNotNull(tickets.slaDueAt),
        lte(tickets.slaDueAt, now),
        isNull(tickets.slaBreachedAt),
        isNull(tickets.archivedAt),
        isNull(tickets.deletedAt),
        notInArray(workflowStates.type, ['completed', 'canceled']),
      ),
    )
    .limit(BATCH);
  if (due.length === 0) return 0;

  const claimed = await db
    .update(tickets)
    .set({ slaBreachedAt: now })
    .where(
      and(
        inArray(
          tickets.id,
          due.map((row) => row.id),
        ),
        isNull(tickets.slaBreachedAt),
      ),
    )
    .returning({
      id: tickets.id,
      projectId: tickets.projectId,
      number: tickets.ticketNumber,
      title: tickets.title,
      assigneeId: tickets.assigneeId,
    });
  if (claimed.length === 0) return 0;

  const projectIds = [...new Set(claimed.map((row) => row.projectId))];
  const [keyRows, memberRows, subscribers] = await Promise.all([
    db
      .select({ id: projects.id, key: projects.ticketKey })
      .from(projects)
      .where(inArray(projects.id, projectIds)),
    db
      .select({
        projectId: projectMembers.projectId,
        userId: projectMembers.userId,
        prefs: userProfiles.notificationPrefs,
      })
      .from(projectMembers)
      .leftJoin(userProfiles, eq(userProfiles.userId, projectMembers.userId))
      .where(inArray(projectMembers.projectId, projectIds)),
    getSubscriberIdsByTicket(claimed.map((row) => row.id)),
  ]);
  const keyOf = new Map(keyRows.map((row) => [row.id, row.key]));
  const memberPrefs = new Map(
    memberRows.map((row) => [`${row.projectId}:${row.userId}`, row.prefs]),
  );

  const rows: NotificationInsert[] = [];
  const events = claimed.map((issue) => {
    const key = `${keyOf.get(issue.projectId) ?? '?'}-${issue.number}`;
    const data = { key, title: issue.title, summary: SUMMARY };
    const recipients = new Set([issue.assigneeId, ...(subscribers.get(issue.id) ?? [])]);
    for (const userId of recipients) {
      if (!userId) continue;
      const member = `${issue.projectId}:${userId}`;
      // Removed members are never notified; a missing profile means "all on".
      if (!memberPrefs.has(member) || !prefEnabled(memberPrefs.get(member), 'sla_breached')) {
        continue;
      }
      rows.push({
        id: crypto.randomUUID(),
        userId,
        projectId: issue.projectId,
        ticketId: issue.id,
        actorId: null,
        type: 'sla_breached',
        data,
        createdAt: now,
      });
    }
    return {
      projectId: issue.projectId,
      ticketId: issue.id,
      actorId: null,
      type: 'issue.sla_breached',
      data: { ...data, summary: 'breached its SLA' },
    };
  });

  await emitIssueEvent(events);
  if (rows.length) {
    await db.insert(notifications).values(rows);
    await deliverToChannels(rows);
  }
  return claimed.length;
}

export async function run(now: Date): Promise<string> {
  let flagged = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const count = await flagBatch(now);
    flagged += count;
    if (count < BATCH) break;
  }
  return `flagged ${flagged} breached issues`;
}
