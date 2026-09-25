'use client';

// Activity section of the issue detail: history lines and comment threads in
// one chronological stream, plus the composer. Loaded client-side (server
// action) when the issue opens and again whenever `issue.updatedAt` moves.

import { useEffect, useMemo, useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';

import {
  createComment,
  deleteComment,
  getIssueTimeline,
  toggleReaction,
  updateComment,
} from '@/app/actions/comments';
import { useProjectData, useProjectPermission } from '@/components/project/project-data';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui-icons';
import { issueUrl } from '@/lib/issue-links';
import type { IssueRow } from '@/lib/issue-model';
import {
  buildTimeline,
  type CommentReaction,
  type IssueTimeline,
  type TimelineComment,
} from '@/lib/timeline';
import { ActivityLine, expandActivities } from './activity-line';
import { CommentComposer } from './comment-composer';
import { CommentItem, commentAnchor, isPendingComment, type CommentHandlers } from './comment-item';
import { toggleReactionGroups } from './reactions';

/** Refetch delay after `updatedAt` moves — lets the optimistic write land first. */
const REFETCH_DELAY_MS = 400;

type Loaded = { issueId: string; timeline: IssueTimeline | null; error: string | null };

function errorText(error: string) {
  return error === 'Forbidden' ? "You don't have permission to do that in this project." : error;
}

export function IssueActivity({ issue }: { issue: IssueRow }) {
  const { members, viewer } = useProjectData();
  const canComment = useProjectPermission('comment');
  const canModerate = useProjectPermission('admin');
  const [loaded, setLoaded] = useState<Loaded>({ issueId: '', timeline: null, error: null });
  const [reload, setReload] = useState(0);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const current = loaded.issueId === issue.id ? loaded : null;
  const timeline = current?.timeline ?? null;
  const updatedAt = new Date(issue.updatedAt).getTime();
  const hasData = current !== null;

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(
      async () => {
        try {
          const result = await getIssueTimeline({ projectId: issue.projectId, ticketId: issue.id });
          if (cancelled) return;
          setLoaded((prev) => {
            if (!result.ok) {
              // Keep showing what we had; only surface the error on first load.
              return prev.issueId === issue.id && prev.timeline
                ? prev
                : { issueId: issue.id, timeline: null, error: errorText(result.error) };
            }
            // Comments still being sent aren't on the server yet.
            const pending =
              prev.issueId === issue.id ? (prev.timeline?.comments.filter(isPendingComment) ?? []) : [];
            return {
              issueId: issue.id,
              timeline: { ...result.timeline, comments: [...result.timeline.comments, ...pending] },
              error: null,
            };
          });
        } catch {
          if (!cancelled) {
            setLoaded((prev) =>
              prev.issueId === issue.id && prev.timeline
                ? prev
                : { issueId: issue.id, timeline: null, error: 'Could not load activity.' },
            );
          }
        }
      },
      hasData ? REFETCH_DELAY_MS : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // hasData only picks the delay; refetching on it would double-load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue.id, issue.projectId, updatedAt, reload]);

  // Permalinks: scroll to and flash `#comment-<id>` once it is rendered.
  const ready = timeline !== null;
  useEffect(() => {
    if (!ready) return;
    const focusHash = () => {
      const id = window.location.hash.slice(1);
      if (!id.startsWith('comment-')) return;
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.dataset.highlighted = 'true';
      setTimeout(() => delete el.dataset.highlighted, 2000);
    };
    focusHash();
    window.addEventListener('hashchange', focusHash);
    return () => window.removeEventListener('hashchange', focusHash);
  }, [ready, issue.id]);

  const names = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);

  const items = useMemo(
    () => (timeline ? buildTimeline(expandActivities(timeline.activities), timeline.comments, expanded) : []),
    [timeline, expanded],
  );

  /** Update this issue's comments (ignored if the pane moved to another issue). */
  const setComments = (issueId: string, update: (comments: TimelineComment[]) => TimelineComment[]) =>
    setLoaded((prev) =>
      prev.issueId === issueId && prev.timeline
        ? { ...prev, timeline: { ...prev.timeline, comments: update(prev.timeline.comments) } }
        : prev,
    );

  async function create(body: string, parentId: string | null): Promise<boolean> {
    const issueId = issue.id;
    const temp: TimelineComment = {
      id: `temp-${crypto.randomUUID()}`,
      parentId,
      body,
      author: { id: viewer.id, name: viewer.name, image: viewer.image },
      createdAt: new Date(),
      editedAt: null,
      reactions: [],
    };
    setComments(issueId, (list) => [...list, temp]);
    try {
      const result = await createComment({ projectId: issue.projectId, ticketId: issueId, body, parentId });
      if (!result.ok) throw new Error(errorText(result.error));
      setComments(issueId, (list) => list.map((c) => (c.id === temp.id ? result.comment : c)));
      return true;
    } catch (err) {
      setComments(issueId, (list) => list.filter((c) => c.id !== temp.id));
      toast.error(err instanceof Error && err.message ? err.message : 'Could not post the comment.');
      return false;
    }
  }

  const handlers: CommentHandlers = {
    onReply: (comment) => setReplyTo(comment.parentId ?? comment.id),
    permalink: (comment) => `${issueUrl(issue.projectId, issue.key)}#${commentAnchor(comment.id)}`,
    onEdit: async (comment, body) => {
      const issueId = issue.id;
      const patch = (c: TimelineComment) => (c.id === comment.id ? { ...c, body, editedAt: new Date() } : c);
      setComments(issueId, (list) => list.map(patch));
      try {
        const result = await updateComment({ projectId: issue.projectId, commentId: comment.id, body });
        if (!result.ok) throw new Error(errorText(result.error));
      } catch (err) {
        setComments(issueId, (list) => list.map((c) => (c.id === comment.id ? comment : c)));
        toast.error(err instanceof Error && err.message ? err.message : 'Could not save the comment.');
      }
    },
    onDelete: async (comment) => {
      const issueId = issue.id;
      // Replies go with their root (FK cascade on the server).
      const doomed = (c: TimelineComment) => c.id === comment.id || c.parentId === comment.id;
      const removed = timeline?.comments.filter(doomed) ?? [];
      setComments(issueId, (list) => list.filter((c) => !doomed(c)));
      try {
        const result = await deleteComment({ projectId: issue.projectId, commentId: comment.id });
        if (!result.ok) throw new Error(errorText(result.error));
      } catch (err) {
        setComments(issueId, (list) => [...list, ...removed]);
        toast.error(err instanceof Error && err.message ? err.message : 'Could not delete the comment.');
      }
    },
    onReact: (comment, emoji: CommentReaction) => {
      const issueId = issue.id;
      // Symmetric: applying the toggle again reverts it.
      const flip = (list: TimelineComment[]) =>
        list.map((c) =>
          c.id === comment.id ? { ...c, reactions: toggleReactionGroups(c.reactions, emoji, viewer.id) } : c,
        );
      setComments(issueId, flip);
      toggleReaction({ projectId: issue.projectId, commentId: comment.id, emoji })
        .then((result) => {
          if (!result.ok) throw new Error(errorText(result.error));
        })
        .catch((err: unknown) => {
          setComments(issueId, flip);
          toast.error(err instanceof Error && err.message ? err.message : 'Could not save the reaction.');
        });
    },
  };

  const commentProps = { viewerId: viewer.id, canComment, canModerate, names, handlers };

  return (
    <TooltipProvider delayDuration={300}>
      <section aria-labelledby={`activity-${issue.id}`} className="flex flex-col gap-3">
        <h2 id={`activity-${issue.id}`} className="text-sm font-medium">
          Activity
        </h2>

        {!current ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading activity">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton variant="card" className="h-16" />
          </div>
        ) : current.error ? (
          <p className="text-sm text-muted-foreground">
            {current.error}{' '}
            <button
              type="button"
              className="text-foreground underline-offset-2 hover:underline"
              onClick={() => {
                setLoaded({ issueId: '', timeline: null, error: null });
                setReload((n) => n + 1);
              }}
            >
              Retry
            </button>
          </p>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground">No activity yet.</p>
        ) : (
          <ol className="flex flex-col gap-1">
            {items.map((item) => {
              if (item.kind === 'activity') {
                return (
                  <li key={item.activity.id}>
                    <ActivityLine line={item.activity} />
                  </li>
                );
              }
              if (item.kind === 'collapsed') {
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setExpanded((prev) => new Set(prev).add(item.id))}
                      className="flex items-center gap-2 py-1 pl-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <ChevronsUpDown className="size-4" aria-hidden />
                      Show {item.count} more
                    </button>
                  </li>
                );
              }
              const threadRoot = item.comment;
              return (
                <li key={threadRoot.id} className="my-2 flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
                  <CommentItem comment={threadRoot} {...commentProps} />
                  {item.replies.map((replyComment) => (
                    <CommentItem key={replyComment.id} comment={replyComment} reply {...commentProps} />
                  ))}
                  {replyTo === threadRoot.id && canComment && (
                    <div className="pl-7">
                      <CommentComposer
                        placeholder="Leave a reply…"
                        submitLabel="Reply"
                        autoFocus
                        onCancel={() => setReplyTo(null)}
                        onSubmit={async (body) => {
                          const ok = await create(body, threadRoot.id);
                          if (ok) setReplyTo(null);
                          return ok;
                        }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {canComment && (
          <CommentComposer key={issue.id} onSubmit={(body) => create(body, null)} />
        )}
      </section>
    </TooltipProvider>
  );
}
