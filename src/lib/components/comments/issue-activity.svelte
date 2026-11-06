<!--
  Activity section of the issue detail: history lines and comment threads in
  one chronological stream, plus the composer.
  Loaded client-side (server action, in an effect) when the issue opens and
  again whenever `issue.updatedAt` moves.
-->
<script module lang="ts">
  import type { IssueTimeline } from '@/lib/timeline';

  /** Refetch delay after `updatedAt` moves — lets the optimistic write land first. */
  const REFETCH_DELAY_MS = 400;

  type Loaded = { issueId: string; timeline: IssueTimeline | null; error: string | null };

</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
  import { toast } from 'svelte-sonner';

  import { actionErrorText } from '@/lib/action-errors';
  import { createComment, deleteComment, getIssueTimeline, toggleReaction, updateComment } from '@/lib/actions/comments';
  import { useProjectData, useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { TooltipProvider } from '@/lib/components/ui/tooltip';
  import { Skeleton } from '@/lib/components/ui-icons';
  import { issueUrl } from '@/lib/issue-links';
  import type { IssueRow } from '@/lib/issue-model';
  import { buildTimeline, type CommentReaction, type TimelineComment } from '@/lib/timeline';
  import ActivityLine, { expandActivities } from './activity-line.svelte';
  import CommentComposer from './comment-composer.svelte';
  import CommentItem, { commentAnchor, isPendingComment, type CommentHandlers } from './comment-item.svelte';
  import { toggleReactionGroups } from './reactions';

  let { issue }: { issue: IssueRow } = $props();

  const data = useProjectData();
  const canComment = useProjectPermission('comment');
  const canModerate = useProjectPermission('admin');
  let loaded = $state.raw<Loaded>({ issueId: '', timeline: null, error: null });
  let reload = $state(0);
  let expanded = $state.raw<ReadonlySet<string>>(new Set());
  let replyTo = $state<string | null>(null);

  const current = $derived(loaded.issueId === issue.id ? loaded : null);
  const timeline = $derived(current?.timeline ?? null);
  const updatedAt = $derived(new Date(issue.updatedAt).getTime());
  const hasData = $derived(current !== null);

  $effect(() => {
    // Deps: issue.id, issue.projectId, updatedAt, reload (hasData only picks the delay).
    const issueId = issue.id;
    const projectId = issue.projectId;
    void updatedAt;
    void reload;
    const delay = untrack(() => (hasData ? REFETCH_DELAY_MS : 0));
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await getIssueTimeline({ projectId, ticketId: issueId });
        if (cancelled) return;
        const prev = loaded;
        if (!result.ok) {
          // Keep showing what we had; only surface the error on first load.
          loaded =
            prev.issueId === issueId && prev.timeline
              ? prev
              : { issueId, timeline: null, error: actionErrorText(result.error) };
          return;
        }
        // Comments still being sent aren't on the server yet.
        const pending = prev.issueId === issueId ? (prev.timeline?.comments.filter(isPendingComment) ?? []) : [];
        loaded = {
          issueId,
          timeline: { ...result.timeline, comments: [...result.timeline.comments, ...pending] },
          error: null,
        };
      } catch {
        if (!cancelled) {
          const prev = loaded;
          loaded =
            prev.issueId === issueId && prev.timeline
              ? prev
              : { issueId, timeline: null, error: 'Could not load activity.' };
        }
      }
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  // Permalinks: scroll to and flash `#comment-<id>` once it is rendered.
  const ready = $derived(timeline !== null);
  $effect(() => {
    void issue.id;
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
  });

  const names = $derived(new Map(data.members.map((m) => [m.id, m.name])));

  const items = $derived(
    timeline ? buildTimeline(expandActivities(timeline.activities), timeline.comments, expanded) : [],
  );

  /** Update this issue's comments (ignored if the pane moved to another issue). */
  function setComments(issueId: string, update: (comments: TimelineComment[]) => TimelineComment[]) {
    const prev = loaded;
    if (prev.issueId === issueId && prev.timeline) {
      loaded = { ...prev, timeline: { ...prev.timeline, comments: update(prev.timeline.comments) } };
    }
  }

  async function create(body: string, parentId: string | null): Promise<boolean> {
    const issueId = issue.id;
    const projectId = issue.projectId;
    const temp: TimelineComment = {
      id: `temp-${crypto.randomUUID()}`,
      parentId,
      body,
      author: { id: data.viewer.id, name: data.viewer.name, image: data.viewer.image },
      createdAt: new Date(),
      editedAt: null,
      reactions: [],
    };
    setComments(issueId, (list) => [...list, temp]);
    try {
      const result = await createComment({ projectId, ticketId: issueId, body, parentId });
      if (!result.ok) throw new Error(actionErrorText(result.error));
      // A refetch may already have brought in the server copy; never keep two rows with one id
      // (keyed #each throws on duplicate keys).
      setComments(issueId, (list) =>
        list.some((c) => c.id === result.comment.id)
          ? list.filter((c) => c.id !== temp.id)
          : list.map((c) => (c.id === temp.id ? result.comment : c)),
      );
      return true;
    } catch (err) {
      setComments(issueId, (list) => list.filter((c) => c.id !== temp.id));
      toast.error(err instanceof Error && err.message ? err.message : 'Could not post the comment.');
      return false;
    }
  }

  const handlers: CommentHandlers = {
    onReply: (comment) => {
      replyTo = comment.parentId ?? comment.id;
    },
    permalink: (comment) => `${issueUrl(issue.projectId, issue.key)}#${commentAnchor(comment.id)}`,
    onEdit: async (comment, body) => {
      const issueId = issue.id;
      const patch = (c: TimelineComment) => (c.id === comment.id ? { ...c, body, editedAt: new Date() } : c);
      setComments(issueId, (list) => list.map(patch));
      try {
        const result = await updateComment({ projectId: issue.projectId, commentId: comment.id, body });
        if (!result.ok) throw new Error(actionErrorText(result.error));
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
        if (!result.ok) throw new Error(actionErrorText(result.error));
      } catch (err) {
        setComments(issueId, (list) => [...list, ...removed]);
        toast.error(err instanceof Error && err.message ? err.message : 'Could not delete the comment.');
      }
    },
    onReact: (comment, emoji: CommentReaction) => {
      const issueId = issue.id;
      const viewerId = data.viewer.id;
      // Symmetric: applying the toggle again reverts it.
      const flip = (list: TimelineComment[]) =>
        list.map((c) =>
          c.id === comment.id ? { ...c, reactions: toggleReactionGroups(c.reactions, emoji, viewerId) } : c,
        );
      setComments(issueId, flip);
      toggleReaction({ projectId: issue.projectId, commentId: comment.id, emoji })
        .then((result) => {
          if (!result.ok) throw new Error(actionErrorText(result.error));
        })
        .catch((err: unknown) => {
          setComments(issueId, flip);
          toast.error(err instanceof Error && err.message ? err.message : 'Could not save the reaction.');
        });
    },
  };
</script>

<TooltipProvider delayDuration={300}>
  <section aria-labelledby={`activity-${issue.id}`} class="flex flex-col gap-3">
    <h2 id={`activity-${issue.id}`} class="text-sm font-medium">Activity</h2>

    {#if !current}
      <div class="flex flex-col gap-2" aria-busy="true" aria-label="Loading activity">
        <Skeleton class="h-5 w-2/3" />
        <Skeleton class="h-5 w-1/2" />
        <Skeleton variant="card" class="h-16" />
      </div>
    {:else if current.error}
      <p class="text-sm text-muted-foreground">
        {current.error}{' '}
        <button
          type="button"
          class="text-foreground underline-offset-2 hover:underline"
          onclick={() => {
            loaded = { issueId: '', timeline: null, error: null };
            reload += 1;
          }}
        >
          Retry
        </button>
      </p>
    {:else if items.length === 0}
      <p class="text-xs text-muted-foreground">No activity yet.</p>
    {:else}
      <ol class="flex flex-col gap-1">
        {#each items as item (item.kind === 'activity' ? `a:${item.activity.id}` : item.kind === 'collapsed' ? `x:${item.id}` : `c:${item.comment.id}`)}
          {#if item.kind === 'activity'}
            <li>
              <ActivityLine line={item.activity} />
            </li>
          {:else if item.kind === 'collapsed'}
            <li>
              <button
                type="button"
                onclick={() => {
                  const next = new Set(expanded);
                  next.add(item.id);
                  expanded = next;
                }}
                class="flex items-center gap-2 py-1 pl-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronsUpDown class="size-4" aria-hidden="true" />
                Show {item.count} more
              </button>
            </li>
          {:else}
            {@const threadRoot = item.comment}
            <li class="my-2 flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
              <CommentItem
                comment={threadRoot}
                viewerId={data.viewer.id}
                canComment={canComment.current}
                canModerate={canModerate.current}
                {names}
                {handlers}
              />
              {#each item.replies as replyComment (replyComment.id)}
                <CommentItem
                  comment={replyComment}
                  reply
                  viewerId={data.viewer.id}
                  canComment={canComment.current}
                  canModerate={canModerate.current}
                  {names}
                  {handlers}
                />
              {/each}
              {#if replyTo === threadRoot.id && canComment.current}
                <div class="pl-7">
                  <CommentComposer
                    placeholder="Leave a reply…"
                    submitLabel="Reply"
                    autoFocus
                    onCancel={() => (replyTo = null)}
                    onSubmit={async (body) => {
                      const ok = await create(body, threadRoot.id);
                      if (ok) replyTo = null;
                      return ok;
                    }}
                  />
                </div>
              {/if}
            </li>
          {/if}
        {/each}
      </ol>
    {/if}

    {#if canComment.current}
      {#key issue.id}
        <CommentComposer onSubmit={(body) => create(body, null)} />
      {/key}
    {/if}
  </section>
</TooltipProvider>
