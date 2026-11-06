// Daily cron job: flag SLA breaches and notify. An open, active issue
// whose `sla_due_at` has passed gets `sla_breached_at` — claimed with a
// conditional update, so a retried run never flags or notifies twice. The
// assignee and subscribers (still project members, type not switched off) get
// an inbox row, then the external channels. Completed / canceled issues never
// breach: their clock stopped.

import { and, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projectMembers, projects, tickets, workflowStates, type notifications } from '@/db/schema';
import { ISSUE_EVENT } from '@/lib/event-names';
import { emitIssueEvent } from '@/lib/events';
import { createNotifications } from '@/lib/notifications/create';
import { slaPastDue } from '@/lib/sla-server';
import { getSubscriberIdsByTicket } from '@/lib/subscriptions';
import { openStateType } from '@/lib/workflow-server';
import { formatIssueKey } from '@/lib/tickets';

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
        slaPastDue(now),
        isNull(tickets.slaBreachedAt),
        isNull(tickets.archivedAt),
        isNull(tickets.deletedAt),
        openStateType(),
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
      .select({ projectId: projectMembers.projectId, userId: projectMembers.userId })
      .from(projectMembers)
      .where(inArray(projectMembers.projectId, projectIds)),
    getSubscriberIdsByTicket(claimed.map((row) => row.id)),
  ]);
  const keyOf = new Map(keyRows.map((row) => [row.id, row.key]));
  const members = new Set(memberRows.map((row) => `${row.projectId}:${row.userId}`));

  const rows: NotificationInsert[] = [];
  const events = claimed.map((issue) => {
    const key = formatIssueKey(keyOf.get(issue.projectId) ?? '?', issue.number);
    const data = { key, title: issue.title, summary: SUMMARY };
    const recipients = new Set([issue.assigneeId, ...(subscribers.get(issue.id) ?? [])]);
    for (const userId of recipients) {
      if (!userId) continue;
      // Removed members are never notified; their type switch is applied on creation.
      if (!members.has(`${issue.projectId}:${userId}`)) continue;
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
      type: ISSUE_EVENT.slaBreached,
      data: { ...data, summary: 'breached its SLA' },
    };
  });

  await emitIssueEvent(events);
  if (rows.length) await createNotifications(rows);
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
