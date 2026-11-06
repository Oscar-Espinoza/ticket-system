<!--
  Lightweight, read-only issue row for cross-project lists (My Issues, search,
  archive, trash). IssueRow from components/issues needs useProjectData(), so
  it can't render outside one project. The whole row is a link to the issue's
  permalink; `actions` sit outside the link so buttons stay valid HTML.
  Port of src/components/navigation/nav-issue-row.tsx.
-->
<script module lang="ts">
  import type { Snippet } from 'svelte';

  import type { IssueRow } from '@/lib/issue-model';

  export interface NavIssueRowProps {
    issue: IssueRow;
    /** Title override (e.g. with search highlights). */
    title?: Snippet;
    /** Second line (search snippet). */
    below?: Snippet;
    /** Project name chip — cross-project lists only. */
    project?: string;
    /** Right-aligned timestamp; defaults to "updated". */
    time?: { date: Date; label: string };
    actions?: Snippet;
  }
</script>

<script lang="ts">
  import LabelChips from '@/lib/components/issues/label-chips.svelte';
  import { Avatar, LabelChip, PriorityIcon, StateIcon } from '@/lib/components/ui-icons';
  import { issuePath } from '@/lib/issue-links';
  import { PRIORITY_LABEL } from '@/lib/issue-model';
  import { cn } from '@/lib/utils';
  import { relativeTime } from '@/lib/relative-time';

  let { issue, title, below, project, time, actions }: NavIssueRowProps = $props();

  const stamp = $derived(time ?? { date: issue.updatedAt, label: 'Updated' });
</script>

<div class="group flex items-center gap-2 rounded-md hover:bg-accent/40 focus-within:bg-accent/40">
  <a
    href={issuePath(issue.projectId, issue.key)}
    data-nav-row
    aria-label={`${issue.key} ${issue.title}, ${issue.state.name}`}
    class={cn(
      'flex min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-md px-2 py-1.5 text-sm outline-none',
      'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
    )}
  >
    <span class="flex h-6 min-w-0 items-center gap-3">
      <span title={PRIORITY_LABEL[issue.priority]} class="flex shrink-0">
        <PriorityIcon priority={issue.priority} size={14} />
      </span>
      <span class="w-16 shrink-0 truncate font-mono text-xs text-muted-foreground">
        {issue.key}
      </span>
      <StateIcon state={issue.state} size={14} class="shrink-0" />
      <span class="min-w-0 flex-1 truncate">
        {#if title}{@render title()}{:else}{issue.title}{/if}
      </span>
      <LabelChips labels={issue.labels} class="hidden md:flex" />
      {#if project}
        <LabelChip dot={false} class="hidden max-w-40 truncate sm:inline-flex">
          {project}
        </LabelChip>
      {/if}
      {#if issue.assignee}
        <Avatar name={issue.assignee.name} src={issue.assignee.image} size={20} class="shrink-0" />
      {/if}
      <!-- React's suppressHydrationWarning: hydration keeps the server text. -->
      <time
        datetime={new Date(stamp.date).toISOString()}
        title={`${stamp.label} ${new Date(stamp.date).toLocaleString()}`}
        class="hidden w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block"
      >
        {relativeTime(stamp.date)}
      </time>
    </span>
    {#if below}
      <span class="block truncate pl-32 text-xs text-muted-foreground">{@render below()}</span>
    {/if}
  </a>
  {#if actions}
    <div class="flex shrink-0 items-center gap-1 pr-2">{@render actions()}</div>
  {/if}
</div>
