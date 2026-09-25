// Comments, reactions, description mentions and the issue timeline read.
// Server-only, NO auth: callers (session actions in src/app/actions/comments.ts,
// the public API) authorize the actor for the project first. Every query is
// scoped by project id through the ticket, so ids from another project match
// nothing.

import { and, asc, desc, eq, inArray, notInArray } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  activities,
  commentReactions,
  comments,
  projectMembers,
  projects,
  tickets,
  users,
} from '@/db/schema';
import { emitIssueEvent, ISSUE_EVENT } from '@/lib/events';
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
  return row ? { id: row.id, key: `${row.ticketKey}-${row.number}`, title: row.title } : null;
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
  return row ? { ...row, key: `${row.ticketKey}-${row.number}` } : null;
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

export async function loadIssueTimeline(projectId: string, ticketId: string): Promise<IssueTimeline> {
  const onTicket = and(eq(comments.ticketId, ticketId), eq(tickets.projectId, projectId));
  const [activityRows, commentRows, reactionRows] = await db.batch([
    db
      .select({
        id: activities.id,
        type: activities.type,
        data: activities.data,
        createdAt: activities.createdAt,
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

  return {
    activities: activityRows.reverse().map((row) => ({
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

export async function createCommentAs(
  actor: CommentActor,
  projectId: string,
  input: { ticketId: unknown; body: unknown; parentId?: unknown },
): Promise<CommentResult<{ comment: TimelineComment }>> {
  const body = validBody(input?.body);
  if (!body) return invalidBody;
  const parentInput = input.parentId ?? null;
  if (parentInput !== null && typeof parentInput !== 'string') return NOT_FOUND;

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
  if (parentInput && !parent) return { ok: false, error: 'The comment you replied to was deleted.' };

  const now = new Date();
  const comment = {
    id: crypto.randomUUID(),
    ticketId: issue.id,
    authorId: actor.userId,
    // One level of threading: a reply to a reply joins the root's thread.
    parentId: parent ? (parent.parentId ?? parent.id) : null,
    body,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(comments).values(comment);

  await Promise.all([
    ensureSubscribed(issue.id, [actor.userId, ...mentions]),
    emitIssueEvent({
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
    }),
  ]);

  return {
    ok: true,
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
  await db
    .update(comments)
    .set({ body, editedAt: now, updatedAt: now })
    .where(eq(comments.id, existing.id));

  await Promise.all([
    ensureSubscribed(existing.ticketId, mentions),
    emitIssueEvent({
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
    }),
  ]);
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
  await db.delete(comments).where(eq(comments.id, existing.id));
  await emitIssueEvent({
    projectId,
    ticketId: existing.ticketId,
    actorId: actor.userId,
    type: COMMENT_EVENT.deleted,
    data: { key: existing.key, title: existing.title, commentId: existing.id, summary: 'deleted a comment' },
  });
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
