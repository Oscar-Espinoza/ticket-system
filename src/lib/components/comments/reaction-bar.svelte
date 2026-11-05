<!-- A comment's reaction chips (ReactionBar of reactions.tsx). -->
<script lang="ts">
  import { Tooltip, TooltipContent, TooltipTrigger } from '@/lib/components/ui/tooltip';
  import type { CommentReaction, ReactionGroup } from '@/lib/timeline';
  import { cn } from '@/lib/utils';
  import { whoReacted } from './reactions';

  let {
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
  } = $props();
</script>

{#if reactions.length > 0}
  <div class="flex flex-wrap items-center gap-1">
    {#each reactions as { emoji, userIds } (emoji)}
      {@const mine = userIds.includes(viewerId)}
      <Tooltip>
        <TooltipTrigger>
          {#snippet child({ props })}
            <button
              {...props}
              type="button"
              aria-pressed={mine}
              aria-label={`${emoji} ${userIds.length}`}
              {disabled}
              onclick={(e: MouseEvent & { currentTarget: HTMLButtonElement }) => {
                // Radix Slot ran the child's handler, then the trigger's.
                onToggle(emoji);
                (props.onclick as ((event: MouseEvent) => void) | undefined)?.(e);
              }}
              class={cn(
                'flex h-6 items-center gap-1 rounded-full border px-2 text-xs tabular-nums transition-colors disabled:pointer-events-none',
                mine ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              <span class="text-sm leading-none">{emoji}</span>
              {userIds.length}
            </button>
          {/snippet}
        </TooltipTrigger>
        <TooltipContent>{whoReacted(userIds, viewerId, names)}</TooltipContent>
      </Tooltip>
    {/each}
  </div>
{/if}
