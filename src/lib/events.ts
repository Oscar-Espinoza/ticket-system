// Issue event bus. Every mutation writes its `activity` rows (the audit log /
// issue history) IN ITS OWN TRANSACTION — commitWithEvents, or
// prepareIssueEvents inside the writer's db.batch — then fans out after the
// response via `after()` to notifications, Slack and outgoing webhooks. A
// failed dispatcher never fails the mutation that already happened.
//
// Webhook delivery is durable: events receivers may need are written with
// `webhook_pending_project_id` set, atomically with the mutation. The
// after-response dispatcher clears it when it has created the delivery rows;
// if it never runs (crash, timeout, DB blip) the sweep in outgoing-webhooks
// picks the event up later. Notifications, Slack and push run once with no
// retry. emitIssueEvent (a standalone write) is only for events that ARE the
// action, with no other row to commit alongside (a mention, a Sentry resolve).
//
// Conventions for `data`:
//   - issue.* events carry { key, title } so dispatchers can render without a lookup.
//   - issue.updated carries { changes: IssueChange[] } with human-usable values
//     (state/label/user names alongside ids).
//   - issue.purged has ticketId null (the row is gone) and { ticketId, key, title }.
//   - comment.created carries { commentId, mentions: userId[] }.

import { inArray, sql, type SQL } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';

import { after } from '@/lib/kit/request';

import { db } from '@/lib/db';
import { activities } from '@/db/schema';
import { ISSUE_EVENT } from '@/lib/event-names';
import { dispatchNotifications } from '@/lib/notifications/dispatch';
import { postToSlack } from '@/lib/integrations/slack';
import { deliverWebhooks, isWebhookDeliverable } from '@/lib/integrations/outgoing-webhooks';

export { ISSUE_EVENT };

/** Known core types; other modules add their own strings (relation.*, github.*, …). */
export type IssueEventType = (typeof ISSUE_EVENT)[keyof typeof ISSUE_EVENT];

export interface IssueEventInput {
  projectId: string;
  /** null = project-level event (or the issue no longer exists). */
  ticketId: string | null;
  /** null = system / integration (GitHub, automation, API without a user). */
  actorId: string | null;
  type: IssueEventType | (string & {});
  data?: Record<string, unknown>;
  /** Defaults to now. Only for events that must sort at a fixed spot in the timeline. */
  createdAt?: Date;
}

export interface StoredIssueEvent {
  /** The activity row id. */
  id: string;
  projectId: string;
  ticketId: string | null;
  actorId: string | null;
  type: string;
  data: Record<string, unknown>;
  createdAt: Date;
}

/** One entry of issue.updated `data.changes`. */
export interface IssueChange {
  /** An IssuePatch field name, e.g. "stateId", "labelIds", "assigneeId". */
  field: string;
  /** Human-usable value: names for ids ({ id, name }), plain values otherwise. */
  from: unknown;
  to: unknown;
  /** Set-valued fields (labelIds): what was added / removed, same shape as from/to items. */
  added?: unknown[];
  removed?: unknown[];
}

export interface IssueUpdatedData {
  key: string;
  title: string;
  changes: IssueChange[];
}

type Dispatcher = (events: StoredIssueEvent[]) => Promise<void>;

const DISPATCHERS: [string, Dispatcher][] = [
  ['notifications', dispatchNotifications],
  ['slack', postToSlack],
  ['webhooks', deliverWebhooks],
];

async function fanOut(events: StoredIssueEvent[]) {
  const results = await Promise.allSettled(DISPATCHERS.map(([, run]) => run(events)));
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(`[events] ${DISPATCHERS[i][0]} dispatcher failed`, result.reason);
    }
  });
}

/** Run after the response when inside a request; otherwise (scripts, tests) now. */
function schedule(task: () => Promise<void>) {
  try {
    after(task);
  } catch {
    void task();
  }
}

/** Ids and timestamps for events about to be written (no I/O). */
export function toStored(list: IssueEventInput[]): StoredIssueEvent[] {
  const now = new Date();
  return list.map((event) => ({
    id: crypto.randomUUID(),
    projectId: event.projectId,
    ticketId: event.ticketId,
    actorId: event.actorId,
    type: event.type,
    data: event.data ?? {},
    createdAt: event.createdAt ?? now,
  }));
}

/**
 * Low-level split of emitIssueEvent for writers that want the activity insert
 * inside their own db.batch (atomic with the mutation, one round trip fewer):
 * put `insert` in the batch, then call publishIssueEvents(stored) once it
 * succeeded. `events` must be non-empty.
 */
export function prepareIssueEvents(events: IssueEventInput[]) {
  const stored = toStored(events);
  return { stored, insert: db.insert(activities).values(activityRows(stored)) };
}

/**
 * Run `statements` and write `events` in ONE db.batch (one transaction: both
 * commit or neither does), then schedule the fan-out. Returns the statements'
 * results (the activity insert's result is dropped). With no events it is a
 * plain batch.
 */
export async function commitWithEvents(
  statements: BatchItem<'pg'>[],
  events: IssueEventInput[],
): Promise<unknown[]> {
  const prepared = events.length ? prepareIssueEvents(events) : null;
  const items = prepared ? [...statements, prepared.insert] : statements;
  if (items.length === 0) return [];
  const results = await db.batch(items as [BatchItem<'pg'>, ...BatchItem<'pg'>[]]);
  if (prepared) publishIssueEvents(prepared.stored);
  return prepared ? results.slice(0, statements.length) : results;
}

/**
 * The activity insert for ONE stored event that writes the row only if `when`
 * (an SQL condition) holds when the statement runs. For events that describe a
 * transition of rows a concurrent writer may change too (a PR linked or merged
 * by two deliveries at once): put it in the writer's db.batch after a lock
 * that serializes those writers and before the write itself, so `when` reads
 * the state the write is about to replace. Then publishWrittenEvents.
 */
export function insertEventIf(event: StoredIssueEvent, when: SQL): BatchItem<'pg'> {
  const [row] = activityRows([event]);
  return db.execute(sql`
    insert into ${activities}
      (id, project_id, ticket_id, actor_id, type, data, webhook_pending_project_id, created_at)
    select ${row.id}, ${row.projectId}, ${row.ticketId}, ${row.actorId}, ${row.type},
      ${JSON.stringify(row.data)}::jsonb, ${row.webhookPendingProjectId}, ${row.createdAt.toISOString()}::timestamp
    where ${when}
  `);
}

/**
 * Schedule the fan-out for those of `stored` that were committed (insertEventIf
 * may have skipped some) and return them. Never throws: the rows are durable,
 * and the webhook sweep finds them even if this lookup fails.
 */
export async function publishWrittenEvents(stored: StoredIssueEvent[]): Promise<StoredIssueEvent[]> {
  if (stored.length === 0) return [];
  try {
    const rows = await db
      .select({ id: activities.id })
      .from(activities)
      .where(inArray(activities.id, stored.map((event) => event.id)));
    const written = new Set(rows.map((row) => row.id));
    const committed = stored.filter((event) => written.has(event.id));
    publishIssueEvents(committed);
    return committed;
  } catch (err) {
    console.error('[events] could not read back written events', err);
    return [];
  }
}

/** Activity rows for stored events, flagged for the durable webhook sweep. */
export function activityRows(stored: StoredIssueEvent[]) {
  return stored.map((event) => ({
    ...event,
    webhookPendingProjectId: isWebhookDeliverable(event) ? event.projectId : null,
  }));
}

/** Schedule the after-response fan-out for events already written. */
export function publishIssueEvents(stored: StoredIssueEvent[]): void {
  if (stored.length > 0) schedule(() => fanOut(stored));
}

export async function emitIssueEvent(
  events: IssueEventInput | IssueEventInput[],
): Promise<StoredIssueEvent[]> {
  const list = Array.isArray(events) ? events : [events];
  if (list.length === 0) return [];

  const stored = toStored(list);
  try {
    await db.insert(activities).values(activityRows(stored));
  } catch (err) {
    console.error('[events] failed to write activity', err);
    return [];
  }

  publishIssueEvents(stored);
  return stored;
}
