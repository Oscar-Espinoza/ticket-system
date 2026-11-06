<!--
  Read-only list of an epic's issues that live in another project. They can't
  go through IssuesView here: its rows, pickers and mutations resolve states,
  labels and members from *this* page's project data. Each row links to the
  issue in its own project, where it's edited.
-->
<script lang="ts">
  import { Avatar, EmptyState, PriorityIcon, StateIcon } from '@/lib/components/ui-icons';
  import { issuePath } from '@/lib/issue-links';
  import { PRIORITY_LABEL, PRIORITY_ORDER, STATE_TYPE_ORDER, type IssueRow } from '@/lib/issue-model';
  import type { ProjectRef } from '@/lib/epic-model';

  let { project, issues }: { project: ProjectRef; issues: IssueRow[] } = $props();

  function compare(a: IssueRow, b: IssueRow) {
    return (
      STATE_TYPE_ORDER.indexOf(a.state.type) - STATE_TYPE_ORDER.indexOf(b.state.type) ||
      a.state.position - b.state.position ||
      PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) ||
      a.number - b.number
    );
  }

  const sorted = $derived([...issues].sort(compare));
</script>

{#if issues.length === 0}
  <EmptyState title="No issues" description={`No active issues from ${project.name}.`} />
{:else}
  <div class="flex flex-col">
    <p class="mb-2 text-xs text-muted-foreground">
      Issues from {project.name} — open one to edit it in its own project.
    </p>
    <ul aria-label={`Issues from ${project.name}`} class="flex flex-col border-t border-border">
      {#each sorted as issue (issue.id)}
        <li class="border-b border-border">
          <a
            href={issuePath(issue.projectId, issue.key)}
            class="flex h-9 items-center gap-3 px-3 text-sm outline-none hover:bg-accent/50 focus-visible:bg-accent"
          >
            <PriorityIcon
              priority={issue.priority}
              size={14}
              aria-label={PRIORITY_LABEL[issue.priority]}
              class="shrink-0 text-muted-foreground"
            />
            <span class="w-16 shrink-0 truncate font-mono text-xs text-muted-foreground">
              {issue.key}
            </span>
            <StateIcon state={issue.state} size={14} />
            <span class="min-w-0 flex-1 truncate">{issue.title}</span>
            {#if issue.assignee}
              <span title={issue.assignee.name} class="shrink-0">
                <Avatar name={issue.assignee.name} src={issue.assignee.image} size={20} />
              </span>
            {/if}
          </a>
        </li>
      {/each}
    </ul>
  </div>
{/if}
