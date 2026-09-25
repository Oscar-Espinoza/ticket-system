'use server';

// Comment, reaction, description-mention and timeline actions: authorize the
// session for the project → src/lib/comments.ts (which scopes every id by the
// project). No revalidation — the timeline is fetched client-side.

import { authorizeProjectAction, roleAllows } from '@/lib/action-auth';
import {
  announceDescriptionMentionsAs,
  createCommentAs,
  deleteCommentAs,
  loadIssueTimeline,
  toggleReactionAs,
  updateCommentAs,
  type CommentResult,
} from '@/lib/comments';
import type { IssueTimeline, TimelineComment } from '@/lib/timeline';

export async function getIssueTimeline(input: {
  projectId: string;
  ticketId: string;
}): Promise<CommentResult<{ timeline: IssueTimeline }>> {
  const authz = await authorizeProjectAction(input?.projectId, 'read');
  if (!authz.ok) return authz;
  if (typeof input.ticketId !== 'string' || !input.ticketId) {
    return { ok: false, error: 'Issue not found.' };
  }
  return { ok: true, timeline: await loadIssueTimeline(input.projectId, input.ticketId) };
}

export async function createComment(input: {
  projectId: string;
  ticketId: string;
  body: string;
  parentId?: string | null;
}): Promise<CommentResult<{ comment: TimelineComment }>> {
  const authz = await authorizeProjectAction(input?.projectId, 'comment');
  if (!authz.ok) return authz;
  return createCommentAs({ userId: authz.userId }, input.projectId, input);
}

export async function updateComment(input: {
  projectId: string;
  commentId: string;
  body: string;
}): Promise<CommentResult<{ editedAt: Date | null }>> {
  const authz = await authorizeProjectAction(input?.projectId, 'comment');
  if (!authz.ok) return authz;
  return updateCommentAs({ userId: authz.userId }, input.projectId, input);
}

export async function deleteComment(input: {
  projectId: string;
  commentId: string;
}): Promise<CommentResult> {
  const authz = await authorizeProjectAction(input?.projectId, 'comment');
  if (!authz.ok) return authz;
  return deleteCommentAs(
    { userId: authz.userId, canModerate: roleAllows(authz.role, 'admin') },
    input.projectId,
    input.commentId,
  );
}

export async function toggleReaction(input: {
  projectId: string;
  commentId: string;
  emoji: string;
}): Promise<CommentResult<{ reacted: boolean }>> {
  const authz = await authorizeProjectAction(input?.projectId, 'comment');
  if (!authz.ok) return authz;
  return toggleReactionAs({ userId: authz.userId }, input.projectId, input);
}

/** Called after a description save; notifies people newly @mentioned in it. */
export async function announceDescriptionMentions(input: {
  projectId: string;
  ticketId: string;
  previous: string | null;
  next: string | null;
}): Promise<CommentResult<{ mentions: string[] }>> {
  const authz = await authorizeProjectAction(input?.projectId, 'write');
  if (!authz.ok) return authz;
  return announceDescriptionMentionsAs({ userId: authz.userId }, input.projectId, input);
}
