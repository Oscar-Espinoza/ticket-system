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
    createdAt: now,
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
