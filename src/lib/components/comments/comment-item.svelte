<!-- One comment with its actions, reactions and inline edit (port of comment-item.tsx). -->
<script module lang="ts">
  import type { CommentReaction, TimelineComment } from '@/lib/timeline';

  export const isPendingComment = (comment: TimelineComment) => comment.id.startsWith('temp-');

  export const commentAnchor = (id: string) => `comment-${id}`;

  export interface CommentHandlers {
    onEdit: (comment: TimelineComment, body: string) => Promise<void>;
    onDelete: (comment: TimelineComment) => Promise<void>;
    onReact: (comment: TimelineComment, emoji: CommentReaction) => void;
    onReply?: (comment: TimelineComment) => void;
    /** Absolute permalink for "Copy link". */
    permalink: (comment: TimelineComment) => string;
  }
</script>

<script lang="ts">
  import Link2 from '@lucide/svelte/icons/link-2';
  import MoreHorizontal from '@lucide/svelte/icons/ellipsis';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Reply from '@lucide/svelte/icons/reply';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { toast } from 'svelte-sonner';

  import { Markdown } from '@/lib/components/editor';
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '@/lib/components/ui/alert-dialog';
  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { Avatar } from '@/lib/components/ui-icons';
  import { cn } from '@/lib/utils';
  import CommentComposer from './comment-composer.svelte';
  import ReactionBar from './reaction-bar.svelte';
  import ReactionPicker from './reaction-picker.svelte';
  import Timestamp from './timestamp.svelte';

  let {
    comment,
    viewerId,
    canComment,
    canModerate,
    names,
    handlers,
    reply = false,
  }: {
    comment: TimelineComment;
    viewerId: string;
    canComment: boolean;
    canModerate: boolean;
    names: Map<string, string>;
    handlers: CommentHandlers;
    /** Replies are indented and have no Reply button (one level of threading). */
    reply?: boolean;
  } = $props();

  let editing = $state(false);
  let confirming = $state(false);
  const pending = $derived(isPendingComment(comment));
  const own = $derived(comment.author?.id === viewerId);
  const canEdit = $derived(own && canComment && !pending);
  const canDelete = $derived((own || canModerate) && canComment && !pending);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(handlers.permalink(comment));
      toast.success('Copied comment link');
    } catch {
      toast.error('Could not copy to the clipboard.');
    }
  }
</script>

<article
  id={commentAnchor(comment.id)}
  aria-label={`Comment by ${comment.author?.name ?? 'deleted user'}`}
  class={cn(
    'group/comment scroll-mt-16 rounded-md transition-colors duration-700 data-[highlighted=true]:bg-primary/10',
    reply ? 'pl-7' : '',
    pending && 'opacity-60',
  )}
>
  <header class="flex items-center gap-2">
    <Avatar name={comment.author?.name ?? 'Deleted user'} src={comment.author?.image} size={20} />
    <span class="truncate text-sm font-medium">{comment.author?.name ?? 'Deleted user'}</span>
    <span class="text-xs text-muted-foreground">
      <Timestamp date={comment.createdAt} />
      {#if comment.editedAt}<span> · edited</span>{/if}
    </span>
    {#if !pending}
      <div
        class="ml-auto flex items-center opacity-0 transition-opacity group-focus-within/comment:opacity-100 group-hover/comment:opacity-100 has-[[aria-expanded=true]]:opacity-100"
      >
        {#if canComment}
          <ReactionPicker onPick={(emoji) => handlers.onReact(comment, emoji)} />
        {/if}
        {#if !reply && canComment && handlers.onReply}
          <Button variant="ghost" size="icon-xs" aria-label="Reply" onclick={() => handlers.onReply?.(comment)}>
            <Reply />
          </Button>
        {/if}
        <DropdownMenu>
          <DropdownMenuTrigger>
            {#snippet child({ props })}
              <Button {...props} variant="ghost" size="icon-xs" aria-label="Comment actions">
                <MoreHorizontal />
              </Button>
            {/snippet}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-44">
            <DropdownMenuItem onSelect={copyLink}>
              <Link2 />
              Copy link
            </DropdownMenuItem>
            {#if canEdit}
              <DropdownMenuItem onSelect={() => (editing = true)}>
                <Pencil />
                Edit
              </DropdownMenuItem>
            {/if}
            {#if canDelete}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => (confirming = true)}>
                <Trash2 />
                Delete
              </DropdownMenuItem>
            {/if}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    {/if}
  </header>

  <div class="mt-1 pl-7">
    {#if editing}
      <CommentComposer
        initialValue={comment.body}
        placeholder="Edit comment…"
        submitLabel="Save"
        autoFocus
        onCancel={() => (editing = false)}
        onSubmit={(body) => {
          editing = false;
          if (body !== comment.body) void handlers.onEdit(comment, body);
          return true;
        }}
      />
    {:else}
      <Markdown source={comment.body} />
    {/if}
    {#if comment.reactions.length > 0}
      <ReactionBar
        reactions={comment.reactions}
        {viewerId}
        {names}
        disabled={!canComment || pending}
        onToggle={(emoji) => handlers.onReact(comment, emoji)}
      />
    {/if}
  </div>

  <AlertDialog open={confirming} onOpenChange={(open) => (confirming = open)}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete comment?</AlertDialogTitle>
        <AlertDialogDescription>
          {reply
            ? 'This reply will be permanently deleted.'
            : 'This comment and any replies to it will be permanently deleted.'}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction variant="destructive" onclick={() => void handlers.onDelete(comment)}>
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</article>
