<!--
  Compact one-line issue reference (sub-issues, relations): state glyph, key,
  title, optional trailing content, and a hover remove button.
  `trailing` is a snippet (React ReactNode).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import XIcon from '@lucide/svelte/icons/x';

  import { isPendingIssue } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { Avatar, StateIcon } from '@/lib/components/ui-icons';
  import type { IssueRow } from '@/lib/issue-model';
  import { cn } from '@/lib/utils';
  import { useOpenIssue } from './open-issue.svelte';

  let {
    issue,
    onRemove,
    removeLabel = 'Remove',
    trailing,
    class: className,
  }: {
    issue: IssueRow;
    /** Shows a hover × button when set. */
    onRemove?: () => void;
    removeLabel?: string;
    trailing?: Snippet;
    class?: string;
  } = $props();

  const open = useOpenIssue();
  const pending = $derived(isPendingIssue(issue));
  const inactive = $derived(Boolean(issue.archivedAt || issue.deletedAt));
</script>

<div
  class={cn(
    'group/ref flex h-8 items-center gap-2 rounded-md px-1.5 text-sm hover:bg-muted/60',
    pending && 'opacity-60',
    className,
  )}
>
  <button
    type="button"
    disabled={pending}
    onclick={() => open(issue)}
    class="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
  >
    <StateIcon state={issue.state} size={14} />
    <span class="shrink-0 font-mono text-xs text-muted-foreground">{issue.key}</span>
    <span class={cn('truncate', inactive && 'text-muted-foreground line-through')}>
      {issue.title}
    </span>
  </button>
  {@render trailing?.()}
  {#if issue.assignee}<Avatar name={issue.assignee.name} src={issue.assignee.image} size={20} />{/if}
  {#if onRemove && !pending}
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={`${removeLabel} ${issue.key}`}
      title={removeLabel}
      onclick={onRemove}
      class="opacity-0 group-hover/ref:opacity-100 focus-visible:opacity-100"
    >
      <XIcon />
    </Button>
  {/if}
</div>
