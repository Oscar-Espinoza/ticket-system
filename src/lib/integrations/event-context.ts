// Shared lookups for the Slack and webhook dispatchers: the issues, actor names
// and comment bodies referenced by a batch of events, in ONE neon-http round trip.
// Events are produced by our own code (emitIssueEvent), so ids are trusted here.
//
// An event belongs to the project it happened in (`projectId`; for swept
// events, webhook_pending_project_id), and its receivers are that project's. An
// issue moved elsewhere since — possibly into a private project, and edited
// there — must not lend its CURRENT title, state or assignee to those
// receivers, so issueOf / commentBodyOf only answer when the issue is still in
// the event's project. Otherwise dispatchers fall back to what the event
// recorded when it happened (`data.key`, `data.title`, `data.excerpt`) and
// webhook payloads carry `issue: null`, as for a purged issue.

import { and, inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { comments, tickets, users } from '@/db/schema';
import type { StoredIssueEvent } from '@/lib/events';
import type { IssueRow } from '@/lib/issue-model';
import { issueQueries, mergeIssueRows } from '@/lib/tickets';
import { absoluteIssueUrl } from '@/lib/integrations/app-url';

export interface EventContext {
  /** By issue id, as they are NOW; read them through issueOf. */
  issues: Map<string, IssueRow>;
  actorNames: Map<string, string>;
  /** By comment id; read them through commentBodyOf. */
  comments: Map<string, { ticketId: string; body: string }>;
}

const unique = <T>(values: (T | null | undefined)[]) =>
  [...new Set(values.filter((v): v is T => v != null))];

export function commentIdOf(event: StoredIssueEvent): string | null {
  const id = event.data.commentId;
  return typeof id === 'string' ? id : null;
}

/** The event's issue as it is now — only while it is still in the event's project. */
export function issueOf(ctx: EventContext, event: StoredIssueEvent): IssueRow | undefined {
  const issue = event.ticketId ? ctx.issues.get(event.ticketId) : undefined;
  return issue && issue.projectId === event.projectId ? issue : undefined;
}

/** The current body of the event's comment, under the same rule as issueOf. */
export function commentBodyOf(ctx: EventContext, event: StoredIssueEvent): string | undefined {
  const id = commentIdOf(event);
  const comment = id ? ctx.comments.get(id) : undefined;
  if (!comment || comment.ticketId !== event.ticketId || !issueOf(ctx, event)) return undefined;
  return comment.body;
}

export async function loadEventContext(events: StoredIssueEvent[]): Promise<EventContext> {
  const ticketIds = unique(events.map((e) => e.ticketId));
  const projectIds = unique(events.map((e) => e.projectId));
  const actorIds = unique(events.map((e) => e.actorId));
  const commentIds = unique(events.map(commentIdOf));

  const [rows, labelRows, actorRows, commentRows] = await db.batch([
    // Issues outside every event's project are never needed (issueOf checks
    // the exact project per event).
    ...issueQueries(and(inArray(tickets.id, ticketIds), inArray(tickets.projectId, projectIds))),
    db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, actorIds)),
    db
      .select({ id: comments.id, ticketId: comments.ticketId, body: comments.body })
      .from(comments)
      .where(and(inArray(comments.id, commentIds), inArray(comments.ticketId, ticketIds))),
  ]);

  return {
    issues: new Map(mergeIssueRows(rows, labelRows).map((issue) => [issue.id, issue])),
    actorNames: new Map(actorRows.map((u) => [u.id, u.name])),
    comments: new Map(commentRows.map((c) => [c.id, { ticketId: c.ticketId, body: c.body }])),
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
