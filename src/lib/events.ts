// Issue event bus. Every issue mutation calls emitIssueEvent: it writes the
// `activity` rows (the audit log / issue history), then fans out after the
// response via next/server `after()` to notifications, Slack and outgoing
// webhooks. Emitting never throws — a failed audit write or dispatcher must
// not fail the mutation that already happened.
//
// Conventions for `data`:
//   - issue.* events carry { key, title } so dispatchers can render without a lookup.
//   - issue.updated carries { changes: IssueChange[] } with human-usable values
//     (state/label/user names alongside ids).
//   - issue.purged has ticketId null (the row is gone) and { ticketId, key, title }.
//   - comment.created carries { commentId, mentions: userId[] } (B1).

import { after } from 'next/server';

import { db } from '@/lib/db';
import { activities } from '@/db/schema';
import { dispatchNotifications } from '@/lib/notifications/dispatch';
import { postToSlack } from '@/lib/integrations/slack';
import { deliverWebhooks } from '@/lib/integrations/outgoing-webhooks';

export const ISSUE_EVENT = {
  created: 'issue.created',
  updated: 'issue.updated',
  archived: 'issue.archived',
  unarchived: 'issue.unarchived',
  deleted: 'issue.deleted',
  restored: 'issue.restored',
  purged: 'issue.purged',
  commentCreated: 'comment.created',
} as const;

/** Known core types; Wave B agents add their own strings (relation.*, github.*, …). */
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

function toStored(list: IssueEventInput[]): StoredIssueEvent[] {
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
  return { stored, insert: db.insert(activities).values(stored) };
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
    await db.insert(activities).values(stored);
  } catch (err) {
    console.error('[events] failed to write activity', err);
    return [];
  }

  publishIssueEvents(stored);
  return stored;
}
