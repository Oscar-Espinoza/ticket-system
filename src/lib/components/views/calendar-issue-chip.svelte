<!-- Calendar chip body. -->
<script lang="ts">
  import { StateIcon } from '@/lib/components/ui-icons';
  import type { IssueRow } from '@/lib/issue-model';
  import { cn } from '@/lib/utils';
  import { isClosed } from '@/lib/workflow';

  let {
    issue,
    selectable = false,
    overlay = false,
  }: {
    issue: IssueRow;
    /** Only its presence matters here (cursor). */
    selectable?: boolean;
    overlay?: boolean;
  } = $props();

  const closed = $derived(isClosed(issue.state.type));
</script>

<div
  class={cn(
    'flex h-6 min-w-0 items-center gap-1.5 rounded border border-border bg-card px-1.5 text-xs',
    overlay && 'shadow-popover',
    selectable && 'cursor-pointer',
  )}
>
  <StateIcon state={issue.state} size={14} />
  <span class="shrink-0 font-mono text-[11px] text-muted-foreground">{issue.key}</span>
  <span class={cn('truncate', closed && 'text-muted-foreground line-through')}>{issue.title}</span>
</div>
