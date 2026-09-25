'use client';

import { SmilePlus } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { COMMENT_REACTIONS, type CommentReaction, type ReactionGroup } from '@/lib/timeline';
import { cn } from '@/lib/utils';

/** Toggle `userId`'s `emoji` on a comment's groups, keeping COMMENT_REACTIONS order. */
export function toggleReactionGroups(
  groups: ReactionGroup[],
  emoji: CommentReaction,
  userId: string,
): ReactionGroup[] {
  const current = groups.find((g) => g.emoji === emoji);
  const userIds = current?.userIds.includes(userId)
    ? current.userIds.filter((id) => id !== userId)
    : [...(current?.userIds ?? []), userId];
  const others = groups.filter((g) => g.emoji !== emoji);
  const next = userIds.length ? [...others, { emoji, userIds }] : others;
  return next.sort((a, b) => COMMENT_REACTIONS.indexOf(a.emoji) - COMMENT_REACTIONS.indexOf(b.emoji));
}

function whoReacted(userIds: string[], viewerId: string, names: Map<string, string>) {
  const people = userIds.map((id) => (id === viewerId ? 'You' : (names.get(id) ?? 'Former member')));
  if (people.length <= 3) {
    return people.length === 1 ? people[0] : `${people.slice(0, -1).join(', ')} and ${people.at(-1)}`;
  }
  return `${people.slice(0, 2).join(', ')} and ${people.length - 2} others`;
}

export function ReactionPicker({
  onPick,
  disabled,
}: {
  onPick: (emoji: CommentReaction) => void;
  disabled?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Add reaction"
          disabled={disabled}
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          <SmilePlus className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto flex-row gap-0.5 p-1">
        {COMMENT_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={`React with ${emoji}`}
            onClick={() => onPick(emoji)}
            className="flex size-7 items-center justify-center rounded-md text-base transition-transform hover:scale-110 hover:bg-muted"
          >
            {emoji}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function ReactionBar({
  reactions,
  viewerId,
  names,
  onToggle,
  disabled,
}: {
  reactions: ReactionGroup[];
  viewerId: string;
  names: Map<string, string>;
  onToggle: (emoji: CommentReaction) => void;
  disabled?: boolean;
}) {
  if (reactions.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {reactions.map(({ emoji, userIds }) => {
        const mine = userIds.includes(viewerId);
        return (
          <Tooltip key={emoji}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-pressed={mine}
                aria-label={`${emoji} ${userIds.length}`}
                disabled={disabled}
                onClick={() => onToggle(emoji)}
                className={cn(
                  'flex h-6 items-center gap-1 rounded-full border px-2 text-xs tabular-nums transition-colors disabled:pointer-events-none',
                  mine
                    ? 'border-primary/40 bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:bg-muted',
                )}
              >
                <span className="text-sm leading-none">{emoji}</span>
                {userIds.length}
              </button>
            </TooltipTrigger>
            <TooltipContent>{whoReacted(userIds, viewerId, names)}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
