'use client';

import { useState } from 'react';
import { Link2, MoreHorizontal, Pencil, Reply, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Markdown } from '@/components/editor';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar } from '@/components/ui-icons';
import type { CommentReaction, TimelineComment } from '@/lib/timeline';
import { cn } from '@/lib/utils';
import { CommentComposer } from './comment-composer';
import { ReactionBar, ReactionPicker } from './reactions';
import { Timestamp } from './timestamp';

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

export function CommentItem({
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
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const pending = isPendingComment(comment);
  const own = comment.author?.id === viewerId;
  const canEdit = own && canComment && !pending;
  const canDelete = (own || canModerate) && canComment && !pending;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(handlers.permalink(comment));
      toast.success('Copied comment link');
    } catch {
      toast.error('Could not copy to the clipboard.');
    }
  }

  return (
    <article
      id={commentAnchor(comment.id)}
      aria-label={`Comment by ${comment.author?.name ?? 'deleted user'}`}
      className={cn(
        'group/comment scroll-mt-16 rounded-md transition-colors duration-700 data-[highlighted=true]:bg-primary/10',
        reply ? 'pl-7' : '',
        pending && 'opacity-60',
      )}
    >
      <header className="flex items-center gap-2">
        <Avatar name={comment.author?.name ?? 'Deleted user'} src={comment.author?.image} size={20} />
        <span className="truncate text-sm font-medium">{comment.author?.name ?? 'Deleted user'}</span>
        <span className="text-xs text-muted-foreground">
          <Timestamp date={comment.createdAt} />
          {comment.editedAt && <span> · edited</span>}
        </span>
        {!pending && (
          <div className="ml-auto flex items-center opacity-0 transition-opacity group-focus-within/comment:opacity-100 group-hover/comment:opacity-100 has-[[aria-expanded=true]]:opacity-100">
            {canComment && <ReactionPicker onPick={(emoji) => handlers.onReact(comment, emoji)} />}
            {!reply && canComment && handlers.onReply && (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Reply"
                onClick={() => handlers.onReply?.(comment)}
              >
                <Reply />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label="Comment actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onSelect={copyLink}>
                  <Link2 />
                  Copy link
                </DropdownMenuItem>
                {canEdit && (
                  <DropdownMenuItem onSelect={() => setEditing(true)}>
                    <Pencil />
                    Edit
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
                      <Trash2 />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </header>

      <div className="mt-1 pl-7">
        {editing ? (
          <CommentComposer
            initialValue={comment.body}
            placeholder="Edit comment…"
            submitLabel="Save"
            autoFocus
            onCancel={() => setEditing(false)}
            onSubmit={(body) => {
              setEditing(false);
              if (body !== comment.body) void handlers.onEdit(comment, body);
              return true;
            }}
          />
        ) : (
          <Markdown>{comment.body}</Markdown>
        )}
        {comment.reactions.length > 0 && (
          <ReactionBar
            reactions={comment.reactions}
            viewerId={viewerId}
            names={names}
            disabled={!canComment || pending}
            onToggle={(emoji) => handlers.onReact(comment, emoji)}
          />
        )}
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
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
            <AlertDialogAction variant="destructive" onClick={() => void handlers.onDelete(comment)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
