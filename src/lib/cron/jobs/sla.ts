// Daily cron job: flag SLA breaches and notify. An open, active issue
// whose `sla_due_at` has passed gets `sla_breached_at` — claimed with a
// conditional update, so a retried run never flags or notifies twice. The
// assignee and subscribers (still project members, type not switched off) get
// an inbox row, then the external channels. Completed / canceled issues never
// breach: their clock stopped.

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { activities, projectMembers, projects, tickets, workflowStates, type notifications } from '@/db/schema';
import { ISSUE_EVENT } from '@/lib/event-names';
import { publishIssueEvents, type StoredIssueEvent } from '@/lib/events';
import { createNotifications } from '@/lib/notifications/create';
import { slaPastDue } from '@/lib/sla-server';
import { getSubscriberIdsByTicket } from '@/lib/subscriptions';
import { openStateType } from '@/lib/workflow-server';

const BATCH = 500;
/** Safety valve: at most this many batches per run (the next run continues). */
const MAX_BATCHES = 10;
const SUMMARY = 'SLA breached';
/** The activity line's summary (the notification's is SUMMARY). */
const EVENT_SUMMARY = 'breached its SLA';

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

  // Claim and log in ONE statement: the breach flag and its issue.sla_breached
  // event (pending for webhooks) commit together, so a crash can't leave an
  // issue flagged with no event — the flag stops the next run from retrying.
  // The key is formatIssueKey in SQL; webhook_pending_project_id is set as
  // activityRows would (an issue event, not bulk: deliverable).
  const ids = sql.join(
    due.map((row) => sql`${row.id}`),
    sql`, `,
  );
  const at = sql`${now.toISOString()}::timestamp`;
  const { rows: claimed } = await db.execute<{
    id: string;
    project_id: string;
    title: string;
    assignee_id: string | null;
    event_id: string;
    data: Record<string, unknown>;
  }>(sql`
    with claimed as (
      update ${tickets} set sla_breached_at = ${at}
      where id in (${ids}) and sla_breached_at is null
      returning id, project_id, ticket_number, title, assignee_id
    ), logged as (
      insert into ${activities} (id, project_id, ticket_id, actor_id, type, data, created_at, webhook_pending_project_id)
      select gen_random_uuid()::text, c.project_id, c.id, null, ${ISSUE_EVENT.slaBreached},
        jsonb_build_object('key', p.ticket_key || '-' || c.ticket_number, 'title', c.title, 'summary', ${EVENT_SUMMARY}::text),
        ${at}, c.project_id
      from claimed c join ${projects} p on p.id = c.project_id
      returning id, ticket_id, data
    )
    select c.id, c.project_id, c.title, c.assignee_id, l.id as event_id, l.data
    from claimed c join logged l on l.ticket_id = c.id
  `);
  if (claimed.length === 0) return 0;

  const projectIds = [...new Set(claimed.map((row) => row.project_id))];
  const [memberRows, subscribers] = await Promise.all([
    db
      .select({ projectId: projectMembers.projectId, userId: projectMembers.userId })
      .from(projectMembers)
      .where(inArray(projectMembers.projectId, projectIds)),
    getSubscriberIdsByTicket(claimed.map((row) => row.id)),
  ]);
  const members = new Set(memberRows.map((row) => `${row.projectId}:${row.userId}`));

  const rows: NotificationInsert[] = [];
  const events: StoredIssueEvent[] = claimed.map((issue) => {
    const data = { key: String(issue.data.key), title: issue.title, summary: SUMMARY };
    const recipients = new Set([issue.assignee_id, ...(subscribers.get(issue.id) ?? [])]);
    for (const userId of recipients) {
      if (!userId) continue;
      // Removed members are never notified; their type switch is applied on creation.
      if (!members.has(`${issue.project_id}:${userId}`)) continue;
      rows.push({
        id: crypto.randomUUID(),
        userId,
        projectId: issue.project_id,
        ticketId: issue.id,
        actorId: null,
        type: 'sla_breached',
        data,
        createdAt: now,
      });
    }
    return {
      id: issue.event_id,
      projectId: issue.project_id,
      ticketId: issue.id,
      actorId: null,
      type: ISSUE_EVENT.slaBreached,
      data: issue.data,
      createdAt: now,
    };
  });

  publishIssueEvents(events);
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
