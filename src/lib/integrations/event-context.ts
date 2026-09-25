// Shared lookups for the Slack and webhook dispatchers: the issues, actor names
// and comment bodies referenced by a batch of events, in ONE neon-http round trip.
// Events are produced by our own code (emitIssueEvent), so ids are trusted here.

import { and, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { comments, tickets, users } from '@/db/schema';
import type { StoredIssueEvent } from '@/lib/events';
import type { IssueRow } from '@/lib/issue-model';
import { issueQueries, mergeIssueRows } from '@/lib/tickets';
import { absoluteIssueUrl } from '@/lib/integrations/app-url';

export interface EventContext {
  issues: Map<string, IssueRow>;
  actorNames: Map<string, string>;
  commentBodies: Map<string, string>;
}

const unique = <T>(values: (T | null | undefined)[]) =>
  [...new Set(values.filter((v): v is T => v != null))];

export function commentIdOf(event: StoredIssueEvent): string | null {
  const id = event.data.commentId;
  return typeof id === 'string' ? id : null;
}

export async function loadEventContext(events: StoredIssueEvent[]): Promise<EventContext> {
  const ticketIds = unique(events.map((e) => e.ticketId));
  const actorIds = unique(events.map((e) => e.actorId));
  const commentIds = unique(events.map(commentIdOf));

  const [rows, labelRows, actorRows, commentRows] = await db.batch([
    ...issueQueries(inArray(tickets.id, ticketIds)),
    db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, actorIds)),
    db
      .select({ id: comments.id, body: comments.body })
      .from(comments)
      .where(and(inArray(comments.id, commentIds), inArray(comments.ticketId, ticketIds))),
  ]);

  return {
    issues: new Map(mergeIssueRows(rows, labelRows).map((issue) => [issue.id, issue])),
    actorNames: new Map(actorRows.map((u) => [u.id, u.name])),
    commentBodies: new Map(commentRows.map((c) => [c.id, c.body])),
  };
}

/** The `issue` object of webhook payloads and API responses' compact form. */
export function issueSummary(issue: IssueRow) {
  return {
    id: issue.id,
    key: issue.key,
    title: issue.title,
    state: { id: issue.state.id, name: issue.state.name, type: issue.state.type },
    priority: issue.priority,
    assignee: issue.assignee ? { id: issue.assignee.id, name: issue.assignee.name } : null,
    url: absoluteIssueUrl(issue.projectId, issue.key),
  };
}
