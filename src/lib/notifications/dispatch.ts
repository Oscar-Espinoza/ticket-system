// Notification fan-out, called by emitIssueEvent after the response for every
// batch of stored events: turns issue events into inbox rows (assignee,
// subscribers, @mentions) and hands them to createNotifications. Never throws —
// the mutation that produced the events already succeeded.
//
// Skipped on purpose: project-level events (ticketId null — member, workflow,
// epic changes), imports (`data.bulk`: creator / assignee are still
// subscribed, nobody is notified) and the state move of a PR merge
// (`data.viaPullRequest`: the PR_EVENT.prMerged notification already covers it).

import { inArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { comments, projectMembers, tickets } from '@/db/schema';
import { ISSUE_EVENT, PR_EVENT } from '@/lib/event-names';
import type { IssueChange, StoredIssueEvent } from '@/lib/events';
import { isStateType, type StateType } from '@/lib/issue-model';
import { stripMentions } from '@/lib/mentions';
import { ensureSubscribed, getSubscriberIdsByTicket } from '@/lib/subscriptions';
import { isClosed } from '@/lib/workflow';
import { createNotifications } from './create';
import type { ChannelNotification } from './channels';
import type { NotificationData, NotificationType } from './types';

const HANDLED = new Set<string>([
  ISSUE_EVENT.created,
  ISSUE_EVENT.updated,
  ISSUE_EVENT.commentCreated,
  ISSUE_EVENT.commentUpdated,
  ISSUE_EVENT.descriptionMentioned,
  PR_EVENT.prMerged,
]);

// When one event gives a user several reasons, the earliest listed wins
// (a mentioned subscriber gets "mentioned", not "commented").
const PRECEDENCE: NotificationType[] = [
  'assigned',
  'mentioned',
  'completed',
  'status_changed',
  'commented',
  'github',
];

const EXCERPT_LENGTH = 200;

export async function dispatchNotifications(events: StoredIssueEvent[]): Promise<void> {
  try {
    await dispatch(events);
  } catch (err) {
    console.error('[notifications] dispatch failed', err);
  }
}

const str = (value: unknown) => (typeof value === 'string' ? value : undefined);

function idOf(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const id = (value as { id?: unknown }).id;
  return typeof id === 'string' ? id : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function changesOf(event: StoredIssueEvent): IssueChange[] {
  const changes = event.data.changes;
  return Array.isArray(changes) ? (changes as IssueChange[]) : [];
}

function stateOf(value: unknown): { name: string; type: StateType } | null {
  if (!value || typeof value !== 'object') return null;
  const { name, type } = value as { name?: unknown; type?: unknown };
  return typeof name === 'string' && isStateType(type) ? { name, type } : null;
}

function excerpt(body: string): string {
  const plain = stripMentions(body).replace(/\s+/g, ' ').trim();
  return plain.length > EXCERPT_LENGTH ? `${plain.slice(0, EXCERPT_LENGTH - 1)}…` : plain;
}

async function dispatch(events: StoredIssueEvent[]) {
  const relevant = events.filter((event) => event.ticketId && HANDLED.has(event.type));
  if (relevant.length === 0) return;

  const ticketIds = [...new Set(relevant.map((event) => event.ticketId!))];
  const projectIds = [...new Set(relevant.map((event) => event.projectId))];
  const commentIds = [
    ...new Set(
      relevant
        // Comment events usually carry an excerpt; look the body up only when missing.
        .filter((event) => event.type.startsWith('comment.') && typeof event.data.excerpt !== 'string')
        .map((event) => str(event.data.commentId))
        .filter((id): id is string => !!id),
    ),
  ];

  const [ticketRows, memberRows, commentRows, subscribersByTicket] = await Promise.all([
    db
      .select({
        id: tickets.id,
        projectId: tickets.projectId,
        assigneeId: tickets.assigneeId,
        creatorId: tickets.creatorId,
      })
      .from(tickets)
      .where(inArray(tickets.id, ticketIds)),
    db
      .select({ projectId: projectMembers.projectId, userId: projectMembers.userId })
      .from(projectMembers)
      .where(inArray(projectMembers.projectId, projectIds)),
    commentIds.length
      ? db
          .select({ id: comments.id, ticketId: comments.ticketId, body: comments.body })
          .from(comments)
          .where(inArray(comments.id, commentIds))
      : Promise.resolve([]),
    getSubscriberIdsByTicket(ticketIds),
  ]);

  const ticketById = new Map(ticketRows.map((row) => [row.id, row]));
  const commentById = new Map(commentRows.map((row) => [row.id, row]));
  // Mentions are client input and subscribers may have left: only current
  // members of the issue's project are ever notified.
  const members = new Set(memberRows.map((row) => `${row.projectId}:${row.userId}`));
  const toSubscribe = new Map<string, Set<string>>();

  const candidates: { event: StoredIssueEvent; userId: string; type: NotificationType; data: NotificationData }[] =
    [];

  for (const event of relevant) {
    const ticket = ticketById.get(event.ticketId!);
    if (!ticket || ticket.projectId !== event.projectId) continue;

    const subscribe = (...ids: (string | null | undefined)[]) => {
      const set = toSubscribe.get(ticket.id) ?? new Set<string>();
      ids.forEach((id) => id && set.add(id));
      toSubscribe.set(ticket.id, set);
    };
    const base: NotificationData = { key: str(event.data.key), title: str(event.data.title) };
    const reasons = new Map<string, { type: NotificationType; data: NotificationData }>();
    const add = (userId: string | null | undefined, type: NotificationType, extra: NotificationData = {}) => {
      if (!userId || userId === event.actorId) return;
      if (!members.has(`${ticket.projectId}:${userId}`)) return;
      const current = reasons.get(userId);
      if (current && PRECEDENCE.indexOf(current.type) <= PRECEDENCE.indexOf(type)) return;
      reasons.set(userId, { type, data: { ...base, ...extra } });
    };
    const subscribers = () => [
      ...new Set([...(subscribersByTicket.get(ticket.id) ?? []), ...(toSubscribe.get(ticket.id) ?? [])]),
    ];

    switch (event.type) {
      case ISSUE_EVENT.created: {
        subscribe(ticket.creatorId ?? event.actorId, ticket.assigneeId);
        if (event.data.bulk !== true) add(ticket.assigneeId, 'assigned');
        break;
      }
      case ISSUE_EVENT.updated: {
        for (const change of changesOf(event)) {
          if (change.field === 'assigneeId') {
            const assigneeId = idOf(change.to);
            subscribe(assigneeId);
            add(assigneeId, 'assigned');
          } else if (change.field === 'stateId') {
            const state = stateOf(change.to);
            if (!state || event.data.viaPullRequest) continue;
            const type = isClosed(state.type) ? 'completed' : 'status_changed';
            for (const userId of subscribers()) add(userId, type, { state });
          }
        }
        break;
      }
      case ISSUE_EVENT.commentCreated:
      case ISSUE_EVENT.commentUpdated: {
        const commentId = str(event.data.commentId);
        const comment = commentId ? commentById.get(commentId) : undefined;
        const body = str(event.data.excerpt) ?? (comment?.ticketId === ticket.id ? comment.body : undefined);
        const extra: NotificationData = { commentId, excerpt: body ? excerpt(body) : undefined };
        for (const userId of stringList(event.data.mentions)) add(userId, 'mentioned', extra);
        // Edits only notify newly mentioned people; the comment itself isn't new.
        if (event.type === ISSUE_EVENT.commentCreated) {
          for (const userId of subscribers()) add(userId, 'commented', extra);
        }
        break;
      }
      case ISSUE_EVENT.descriptionMentioned: {
        const body = str(event.data.excerpt);
        const extra: NotificationData = { excerpt: body ? excerpt(body) : undefined };
        for (const userId of stringList(event.data.mentions)) add(userId, 'mentioned', extra);
        break;
      }
      case PR_EVENT.prMerged: {
        const summary = str(event.data.summary);
        for (const userId of subscribers()) add(userId, 'github', { summary });
        break;
      }
    }

    for (const [userId, reason] of reasons) {
      candidates.push({ event, userId, ...reason });
    }
  }

  const subscribing = Promise.all(
    [...toSubscribe].map(([ticketId, ids]) => ensureSubscribed(ticketId, [...ids])),
  ).catch((err) => console.error('[notifications] auto-subscribe failed', err));

  if (candidates.length === 0) {
    await subscribing;
    return;
  }

  const rows: ChannelNotification[] = candidates.map((candidate) => ({
    id: crypto.randomUUID(),
    userId: candidate.userId,
    projectId: candidate.event.projectId,
    ticketId: candidate.event.ticketId,
    actorId: candidate.event.actorId,
    type: candidate.type,
    data: candidate.data as Record<string, unknown>,
    createdAt: candidate.event.createdAt,
  }));

  await createNotifications(rows, { beforeDelivery: subscribing });
  await subscribing;
}
