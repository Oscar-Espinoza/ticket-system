<!-- Emoji picker for a comment. -->
<script lang="ts">
  import SmilePlus from '@lucide/svelte/icons/smile-plus';

  import { Popover, PopoverContent, PopoverTrigger } from '@/lib/components/ui/popover';
  import { COMMENT_REACTIONS, type CommentReaction } from '@/lib/timeline';

  let { onPick, disabled }: { onPick: (emoji: CommentReaction) => void; disabled?: boolean } = $props();
</script>

<Popover>
  <PopoverTrigger>
    {#snippet child({ props })}
      <button
        {...props}
        type="button"
        aria-label="Add reaction"
        {disabled}
        class="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        <SmilePlus class="size-3.5" />
      </button>
    {/snippet}
  </PopoverTrigger>
  <PopoverContent align="start" class="w-auto flex-row gap-0.5 p-1">
    {#each COMMENT_REACTIONS as emoji (emoji)}
      <button
        type="button"
        aria-label={`React with ${emoji}`}
        onclick={() => onPick(emoji)}
        class="flex size-7 items-center justify-center rounded-md text-base transition-transform hover:scale-110 hover:bg-muted"
      >
        {emoji}
      </button>
    {/each}
  </PopoverContent>
</Popover>
