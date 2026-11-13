// Comments, reactions, description mentions and the issue timeline read.
// Server-only, NO auth: callers (session actions in src/app/actions/comments.ts,
// the public API) authorize the actor for the project first. Every query is
// scoped by project id through the ticket, so ids from another project match
// nothing.

import { and, asc, desc, eq, inArray, notInArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import { isUniqueViolation } from '@/lib/db-errors';
import {
  activities,
  commentReactions,
  comments,
  projectMembers,
  projects,
  tickets,
  users,
} from '@/db/schema';
import { emitIssueEvent, ISSUE_EVENT, prepareIssueEvents, publishIssueEvents } from '@/lib/events';
import type { IssueUser } from '@/lib/issue-model';
import { extractMentionIds, newMentionIds, stripMentions } from '@/lib/mentions';
import { ensureSubscribed } from '@/lib/subscriptions';
import {
  COMMENT_MAX_LENGTH,
  COMMENT_REACTIONS,
  HIDDEN_ACTIVITY_TYPES,
  excerptOf,
  isCommentReaction,
  type IssueTimeline,
  type ReactionGroup,
  type TimelineComment,
} from '@/lib/timeline';
import { formatIssueKey } from '@/lib/tickets';
import { redactActivityFor } from '@/lib/moved-events';

export const COMMENT_EVENT = {
  created: ISSUE_EVENT.commentCreated,
  updated: 'comment.updated',
  deleted: 'comment.deleted',
  descriptionMentioned: 'description.mentioned',
} as const;

export interface CommentActor {
  userId: string;
  /** Admins may delete anyone's comment. */
  canModerate?: boolean;
}

export type CommentResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const NOT_FOUND = { ok: false as const, error: 'Comment not found.' };
const ISSUE_NOT_FOUND = { ok: false as const, error: 'Issue not found.' };
/** Newest history kept in the timeline; older rows stay in the audit log. */
const TIMELINE_LIMIT = 500;

function validBody(body: unknown): string | null {
  if (typeof body !== 'string') return null;
  const value = body.trim();
  return value && value.length <= COMMENT_MAX_LENGTH ? value : null;
}

const invalidBody = {
  ok: false as const,
  error: `Comments must be 1–${COMMENT_MAX_LENGTH.toLocaleString('en')} characters.`,
};

function toUser(row: { id: string | null; name: string | null; image: string | null }): IssueUser | null {
  return row.id && row.name !== null ? { id: row.id, name: row.name, image: row.image } : null;
}

function excerpt(body: string) {
  return excerptOf(stripMentions(body));
}

/** The issue (key + title for event data) if it belongs to the project. */
async function findIssue(projectId: string, ticketId: unknown) {
  if (typeof ticketId !== 'string' || !ticketId) return null;
  const [row] = await db
    .select({ id: tickets.id, number: tickets.ticketNumber, title: tickets.title, ticketKey: projects.ticketKey })
    .from(tickets)
    .innerJoin(projects, eq(projects.id, tickets.projectId))
    .where(and(eq(tickets.id, ticketId), eq(tickets.projectId, projectId)))
    .limit(1);
  return row ? { id: row.id, key: formatIssueKey(row.ticketKey, row.number), title: row.title } : null;
}

/** A comment with its issue, if the comment is on an issue of the project. */
async function findComment(projectId: string, commentId: unknown) {
  if (typeof commentId !== 'string' || !commentId) return null;
  const [row] = await db
    .select({
      id: comments.id,
      authorId: comments.authorId,
      body: comments.body,
      editedAt: comments.editedAt,
      ticketId: tickets.id,
      number: tickets.ticketNumber,
      title: tickets.title,
      ticketKey: projects.ticketKey,
    })
    .from(comments)
    .innerJoin(tickets, eq(tickets.id, comments.ticketId))
    .innerJoin(projects, eq(projects.id, tickets.projectId))
    .where(and(eq(comments.id, commentId), eq(tickets.projectId, projectId)))
    .limit(1);
  return row ? { ...row, key: formatIssueKey(row.ticketKey, row.number) } : null;
}

/** The subset of `ids` that are members of the project (mentions of others are ignored). */
async function projectMemberIds(projectId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), inArray(projectMembers.userId, ids)));
  const members = new Set(rows.map((r) => r.userId));
  return ids.filter((id) => members.has(id));
}

// ---------------------------------------------------------------------------
// Timeline read
// ---------------------------------------------------------------------------

/** `loadIssueTimeline` for an untrusted `ticketId`; a missing id is "not found". */
export async function readIssueTimeline(
  projectId: string,
  ticketId: unknown,
  viewerId: string,
): Promise<CommentResult<{ timeline: IssueTimeline }>> {
  if (typeof ticketId !== 'string' || !ticketId) return { ok: false, error: 'Issue not found.' };
  return { ok: true, timeline: await loadIssueTimeline(projectId, ticketId, viewerId) };
}

/**
 * The issue's activity and comments as `viewerId` (a member of `projectId`)
 * may see them: rows recorded while the issue was in a project the viewer is
 * not a member of are collapsed, and moves name another project only when the
 * viewer belongs to it (moved-events.ts).
 */
export async function loadIssueTimeline(
  projectId: string,
  ticketId: string,
  viewerId: string,
): Promise<IssueTimeline> {
  const onTicket = and(eq(comments.ticketId, ticketId), eq(tickets.projectId, projectId));
  const [activityRows, commentRows, reactionRows] = await db.batch([
    db
      .select({
        id: activities.id,
        type: activities.type,
        data: activities.data,
        createdAt: activities.createdAt,
        ticketId: activities.ticketId,
        projectId: activities.projectId,
        actorId: users.id,
        actorName: users.name,
        actorImage: users.image,
      })
      .from(activities)
      .leftJoin(users, eq(users.id, activities.actorId))
      .where(
        and(
          eq(activities.ticketId, ticketId),
          eq(activities.projectId, projectId),
          notInArray(activities.type, [...HIDDEN_ACTIVITY_TYPES]),
        ),
      )
      .orderBy(desc(activities.createdAt))
      .limit(TIMELINE_LIMIT),
    db
      .select({
        id: comments.id,
        parentId: comments.parentId,
        body: comments.body,
        createdAt: comments.createdAt,
        editedAt: comments.editedAt,
        authorId: users.id,
        authorName: users.name,
        authorImage: users.image,
      })
      .from(comments)
      .innerJoin(tickets, eq(tickets.id, comments.ticketId))
      .leftJoin(users, eq(users.id, comments.authorId))
      .where(onTicket)
      .orderBy(asc(comments.createdAt))
      .limit(TIMELINE_LIMIT),
    db
      .select({
        commentId: commentReactions.commentId,
        userId: commentReactions.userId,
        emoji: commentReactions.emoji,
      })
      .from(commentReactions)
      .innerJoin(comments, eq(comments.id, commentReactions.commentId))
      .innerJoin(tickets, eq(tickets.id, comments.ticketId))
      .where(onTicket)
      .orderBy(asc(commentReactions.createdAt)),
  ]);

  const reactionsByComment = new Map<string, Map<string, string[]>>();
  for (const row of reactionRows) {
    const byEmoji = reactionsByComment.get(row.commentId) ?? new Map<string, string[]>();
    byEmoji.set(row.emoji, [...(byEmoji.get(row.emoji) ?? []), row.userId]);
    reactionsByComment.set(row.commentId, byEmoji);
  }
  const groupsFor = (commentId: string): ReactionGroup[] => {
    const byEmoji = reactionsByComment.get(commentId);
    if (!byEmoji) return [];
    return COMMENT_REACTIONS.flatMap((emoji) => {
      const userIds = byEmoji.get(emoji);
      return userIds?.length ? [{ emoji, userIds }] : [];
    });
  };

  const visibleActivity = await redactActivityFor(
    activityRows.map((row) => ({ ...row, data: row.data ?? {} })),
    viewerId,
  );
  return {
    activities: visibleActivity.reverse().map((row) => ({
      id: row.id,
      type: row.type,
      data: row.data ?? {},
      createdAt: row.createdAt,
      actor: toUser({ id: row.actorId, name: row.actorName, image: row.actorImage }),
    })),
    comments: commentRows.map((row) => ({
      id: row.id,
      parentId: row.parentId,
      body: row.body,
      createdAt: row.createdAt,
      editedAt: row.editedAt,
      author: toUser({ id: row.authorId, name: row.authorName, image: row.authorImage }),
      reactions: groupsFor(row.id),
    })),
  };
}

// ---------------------------------------------------------------------------
// Comment writes
// ---------------------------------------------------------------------------

/** createCommentAs's error when `input.id` belongs to a comment it cannot replay (another issue or author). */
export const COMMENT_ID_IN_USE = 'This comment id is already in use.';

/**
 * The comment an earlier attempt with the same client id created, or why the
 * id can't be reused. Same rule as an issue's client id (issue-service
 * `existingCreate`): the same author on the same issue replays.
 */
async function existingComment(
  actor: CommentActor,
  ticketId: string,
  id: string,
  sent: { body: string; parentId: string | null | undefined },
): Promise<CommentResult<{ comment: TimelineComment; replayed: true }> | null> {
  const [row] = await db
    .select({
      id: comments.id,
      ticketId: comments.ticketId,
      authorId: comments.authorId,
      parentId: comments.parentId,
      body: comments.body,
      createdAt: comments.createdAt,
      editedAt: comments.editedAt,
      authorName: users.name,
      authorImage: users.image,
    })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.id, id))
    .limit(1);
  if (!row) return null;
  if (row.ticketId !== ticketId || row.authorId !== actor.userId) return { ok: false, error: COMMENT_ID_IN_USE };
  // A replay is the same comment again. A different text (or reply target) under the same id is a different comment:
  // answering "saved" would drop it (the client edited its draft after a timeout and sent it with the old id).
  if (row.body !== sent.body || (sent.parentId !== undefined && row.parentId !== sent.parentId)) return { ok: false, error: COMMENT_ID_IN_USE };
  return {
    ok: true,
    replayed: true,
    comment: {
      id: row.id,
      parentId: row.parentId,
      body: row.body,
      author: toUser({ id: row.authorId, name: row.authorName, image: row.authorImage }),
      createdAt: row.createdAt,
      editedAt: row.editedAt,
      reactions: [],
    },
  };
}

/**
 * Adds a comment. `input.id` is an optional client-chosen UUID that makes the
 * create idempotent: the same author on the same issue with the same id and the
 * same body gets the existing comment back (`replayed: true`, no second row, activity or
 * notification); any other use of the id is refused.
 */
export async function createCommentAs(
  actor: CommentActor,
  projectId: string,
  input: { ticketId: unknown; body: unknown; parentId?: unknown; id?: string },
): Promise<CommentResult<{ comment: TimelineComment; replayed: boolean }>> {
  const body = validBody(input?.body);
  if (!body) return invalidBody;
  const parentInput = input.parentId ?? null;
  if (parentInput !== null && typeof parentInput !== 'string') return NOT_FOUND;
  const requestedId = input.id?.toLowerCase();

  const [issue, parent, mentions, [author]] = await Promise.all([
    findIssue(projectId, input.ticketId),
    parentInput
      ? db
          .select({ id: comments.id, parentId: comments.parentId })
          .from(comments)
          .where(and(eq(comments.id, parentInput), eq(comments.ticketId, String(input.ticketId))))
          .limit(1)
          .then(([row]) => row ?? null)
      : null,
    projectMemberIds(projectId, extractMentionIds(body)),
    db
      .select({ id: users.id, name: users.name, image: users.image })
      .from(users)
      .where(eq(users.id, actor.userId))
      .limit(1),
  ]);
  if (!issue) return ISSUE_NOT_FOUND;
  // Replies join the root's thread; a reply target that no longer exists is not compared.
  const sent = { body, parentId: parentInput ? (parent ? (parent.parentId ?? parent.id) : undefined) : null };
  if (requestedId) {
    const replay = await existingComment(actor, issue.id, requestedId, sent);
    if (replay) return replay;
  }
  if (parentInput && !parent) return { ok: false, error: 'The comment you replied to was deleted.' };

  const now = new Date();
  const comment = {
    id: requestedId ?? crypto.randomUUID(),
    ticketId: issue.id,
    authorId: actor.userId,
    // One level of threading: a reply to a reply joins the root's thread.
    parentId: parent ? (parent.parentId ?? parent.id) : null,
    body,
    createdAt: now,
    updatedAt: now,
  };
  // The comment.created activity commits with the comment, so a crash after
  // the write can't lose the event (the webhook sweep relies on that row).
  const { stored, insert } = prepareIssueEvents([
    {
      projectId,
      ticketId: issue.id,
      actorId: actor.userId,
      type: COMMENT_EVENT.created,
      data: {
        key: issue.key,
        title: issue.title,
        commentId: comment.id,
        parentId: comment.parentId,
        excerpt: excerpt(body),
        mentions,
        summary: comment.parentId ? 'replied to a comment' : 'commented',
      },
    },
  ]);
  try {
    await db.batch([db.insert(comments).values(comment), insert]);
  } catch (err) {
    // A concurrent attempt with the same client id won the insert (the batch,
    // activity included, rolled back): answer with that comment.
    if (requestedId && isUniqueViolation(err)) {
      const replay = await existingComment(actor, issue.id, requestedId, sent);
      if (replay) return replay;
    }
    throw err;
  }
  publishIssueEvents(stored);
  await ensureSubscribed(issue.id, [actor.userId, ...mentions]);

  return {
    ok: true,
    replayed: false,
    comment: {
      id: comment.id,
      parentId: comment.parentId,
      body,
      author: author ?? null,
      createdAt: now,
      editedAt: null,
      reactions: [],
    },
  };
}

export async function updateCommentAs(
  actor: CommentActor,
  projectId: string,
  input: { commentId: unknown; body: unknown },
): Promise<CommentResult<{ editedAt: Date | null }>> {
  const body = validBody(input?.body);
  if (!body) return invalidBody;
  const existing = await findComment(projectId, input.commentId);
  if (!existing) return NOT_FOUND;
  if (existing.authorId !== actor.userId) {
    return { ok: false, error: 'You can only edit your own comments.' };
  }
  if (existing.body === body) return { ok: true, editedAt: existing.editedAt };

  const now = new Date();
  const mentions = (
    await projectMemberIds(projectId, newMentionIds(existing.body, body))
  ).filter((id) => id !== actor.userId);
  const { stored, insert } = prepareIssueEvents([
    {
      projectId,
      ticketId: existing.ticketId,
      actorId: actor.userId,
      type: COMMENT_EVENT.updated,
      // Only newly added mentions — the rest were notified on create.
      data: {
        key: existing.key,
        title: existing.title,
        commentId: existing.id,
        excerpt: excerpt(body),
        mentions,
        summary: 'edited a comment',
      },
    },
  ]);
  await db.batch([
    db.update(comments).set({ body, editedAt: now, updatedAt: now }).where(eq(comments.id, existing.id)),
    insert,
  ]);
  publishIssueEvents(stored);
  await ensureSubscribed(existing.ticketId, mentions);
  return { ok: true, editedAt: now };
}

export async function deleteCommentAs(
  actor: CommentActor,
  projectId: string,
  commentId: unknown,
): Promise<CommentResult> {
  const existing = await findComment(projectId, commentId);
  if (!existing) return NOT_FOUND;
  if (existing.authorId !== actor.userId && !actor.canModerate) {
    return { ok: false, error: 'You can only delete your own comments.' };
  }
  // Replies and reactions cascade.
  const { stored, insert } = prepareIssueEvents([
    {
      projectId,
      ticketId: existing.ticketId,
      actorId: actor.userId,
      type: COMMENT_EVENT.deleted,
      data: { key: existing.key, title: existing.title, commentId: existing.id, summary: 'deleted a comment' },
    },
  ]);
  await db.batch([db.delete(comments).where(eq(comments.id, existing.id)), insert]);
  publishIssueEvents(stored);
  return { ok: true };
}

export async function toggleReactionAs(
  actor: CommentActor,
  projectId: string,
  input: { commentId: unknown; emoji: unknown },
): Promise<CommentResult<{ reacted: boolean }>> {
  if (!isCommentReaction(input?.emoji)) return { ok: false, error: 'Unsupported reaction.' };
  const emoji = input.emoji;
  const existing = await findComment(projectId, input.commentId);
  if (!existing) return NOT_FOUND;

  const removed = await db
    .delete(commentReactions)
    .where(
      and(
        eq(commentReactions.commentId, existing.id),
        eq(commentReactions.userId, actor.userId),
        eq(commentReactions.emoji, emoji),
      ),
    )
    .returning({ id: commentReactions.id });
  if (removed.length > 0) return { ok: true, reacted: false };

  await db
    .insert(commentReactions)
    .values({
      id: crypto.randomUUID(),
      commentId: existing.id,
      userId: actor.userId,
      emoji,
      createdAt: new Date(),
    })
    .onConflictDoNothing();
  return { ok: true, reacted: true };
}

// ---------------------------------------------------------------------------
// Description mentions
// ---------------------------------------------------------------------------

/**
 * Notify people newly mentioned by a description edit. `previous` comes from
 * the client (the update already replaced it); it can only cause notifications
 * for people actually mentioned in `next`, which the writer could trigger by
 * editing anyway.
 */
export async function announceDescriptionMentionsAs(
  actor: CommentActor,
  projectId: string,
  input: { ticketId: unknown; previous: unknown; next: unknown },
): Promise<CommentResult<{ mentions: string[] }>> {
  const previous = typeof input?.previous === 'string' ? input.previous : '';
  const next = typeof input?.next === 'string' ? input.next : '';
  const candidates = newMentionIds(previous, next).filter((id) => id !== actor.userId);
  if (candidates.length === 0) return { ok: true, mentions: [] };

  const [issue, mentions] = await Promise.all([
    findIssue(projectId, input.ticketId),
    projectMemberIds(projectId, candidates),
  ]);
  if (!issue) return ISSUE_NOT_FOUND;
  if (mentions.length === 0) return { ok: true, mentions: [] };

  await Promise.all([
    ensureSubscribed(issue.id, mentions),
    emitIssueEvent({
      projectId,
      ticketId: issue.id,
      actorId: actor.userId,
      type: COMMENT_EVENT.descriptionMentioned,
      data: {
        key: issue.key,
        title: issue.title,
        mentions,
        excerpt: excerpt(next),
        summary: 'mentioned you in the description',
      },
    }),
  ]);
  return { ok: true, mentions };
}
