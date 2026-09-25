// Issue timeline (activity history + comments). Client-safe: types, the
// reaction set and pure helpers. Server reads/writes live in src/lib/comments.ts.

import type { IssueUser } from '@/lib/issue-model';

export const COMMENT_REACTIONS = ['👍', '👎', '❤️', '🎉', '😄', '😕', '👀', '🚀'] as const;
export type CommentReaction = (typeof COMMENT_REACTIONS)[number];

export function isCommentReaction(value: unknown): value is CommentReaction {
  return (COMMENT_REACTIONS as readonly unknown[]).includes(value);
}

export const COMMENT_MAX_LENGTH = 10_000;

export interface ReactionGroup {
  emoji: CommentReaction;
  /** In reaction order. */
  userIds: string[];
}

export interface TimelineComment {
  id: string;
  /** Thread root; null for top-level comments. */
  parentId: string | null;
  body: string;
  /** null = the author's account was deleted. */
  author: IssueUser | null;
  createdAt: Date;
  editedAt: Date | null;
  /** In COMMENT_REACTIONS order, empty groups omitted. */
  reactions: ReactionGroup[];
}

export interface TimelineActivity {
  id: string;
  type: string;
  /** null = system / integration. */
  actor: IssueUser | null;
  data: Record<string, unknown>;
  createdAt: Date;
}

export interface IssueTimeline {
  activities: TimelineActivity[];
  comments: TimelineComment[];
}

/** Activity types represented elsewhere in the timeline (the comment itself, the description line). */
export const HIDDEN_ACTIVITY_TYPES = new Set([
  'comment.created',
  'comment.updated',
  'comment.deleted',
  'description.mentioned',
]);

/** Excerpt for notifications / Slack: mentions as `@Name`, whitespace collapsed. */
export function excerptOf(plain: string, max = 200): string {
  const text = plain.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export type TimelineItem<A> =
  | { kind: 'activity'; activity: A }
  | { kind: 'comment'; comment: TimelineComment; replies: TimelineComment[] }
  | { kind: 'collapsed'; id: string; count: number };

/** Runs longer than this collapse to first + last COLLAPSE_TAIL. */
const COLLAPSE_OVER = 5;
const COLLAPSE_TAIL = 2;

/**
 * Chronological stream of activity lines and comment threads. Consecutive
 * activity runs longer than COLLAPSE_OVER keep their first and last lines with
 * a `collapsed` marker between, unless the run's id is in `expanded`.
 * `activities` must be sorted oldest first.
 */
export function buildTimeline<A extends { id: string; createdAt: Date }>(
  activities: A[],
  comments: TimelineComment[],
  expanded: ReadonlySet<string>,
): TimelineItem<A>[] {
  const roots = comments.filter((c) => c.parentId === null);
  const replies = new Map<string, TimelineComment[]>();
  for (const comment of comments) {
    if (comment.parentId === null) continue;
    const list = replies.get(comment.parentId) ?? [];
    list.push(comment);
    replies.set(comment.parentId, list);
  }

  const merged: ({ at: number } & (
    | { kind: 'activity'; activity: A }
    | { kind: 'comment'; comment: TimelineComment }
  ))[] = [
    ...activities.map((activity) => ({
      kind: 'activity' as const,
      activity,
      at: new Date(activity.createdAt).getTime(),
    })),
    ...roots.map((comment) => ({
      kind: 'comment' as const,
      comment,
      at: new Date(comment.createdAt).getTime(),
    })),
  ].sort((a, b) => a.at - b.at);

  const items: TimelineItem<A>[] = [];
  let run: A[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const id = `run-${run[0].id}`;
    if (run.length > COLLAPSE_OVER && !expanded.has(id)) {
      items.push({ kind: 'activity', activity: run[0] });
      items.push({ kind: 'collapsed', id, count: run.length - 1 - COLLAPSE_TAIL });
      for (const activity of run.slice(-COLLAPSE_TAIL)) items.push({ kind: 'activity', activity });
    } else {
      for (const activity of run) items.push({ kind: 'activity', activity });
    }
    run = [];
  };
  for (const entry of merged) {
    if (entry.kind === 'activity') {
      run.push(entry.activity);
      continue;
    }
    flush();
    items.push({
      kind: 'comment',
      comment: entry.comment,
      replies: (replies.get(entry.comment.id) ?? []).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    });
  }
  flush();
  return items;
}
