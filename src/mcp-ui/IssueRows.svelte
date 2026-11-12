<script lang="ts">
  // Issue rows, optionally grouped. A write inside an expanded row patches the
  // row (state, assignee, labels…) without a new list call.
  import type { IssueDetail, IssueSummary } from '@/lib/server/mcp/contracts';
  import { groupIssues } from './lib/model';
  import IssueRow from './IssueRow.svelte';
  import StateIcon from './StateIcon.svelte';

  interface Props {
    issues: IssueSummary[];
    groupBy?: 'state' | 'priority' | null;
    showProject?: boolean;
  }
  let { issues, groupBy = null, showProject = false }: Props = $props();

  let patches = $state.raw<Record<string, IssueSummary>>({});
  const rows = $derived(issues.map((i) => patches[i.id] ?? i));
  const groups = $derived(groupIssues(rows, groupBy));

  function patch(next: IssueDetail) {
    const { description: _d, creator: _c, cycle: _cy, epic: _e, parent: _p, subIssues: _s, relations: _r, comments: _co, commentCount: _cc, archivedAt: _a, deletedAt: _de, createdAt: _cr, ...summary } = next;
    patches = { ...patches, [next.id]: summary };
  }
</script>

{#each groups as group (group.key)}
  <section aria-label={group.label || undefined}>
    {#if group.label}
      <h3 class="sticky top-0 z-10 flex items-center gap-2 bg-bg2 px-1.5 py-1 font-semibold text-fg2">
        {#if groupBy === 'state'}
          {@const sample = group.issues[0]}
          {#if sample}<StateIcon type={sample.state.type} color={sample.state.color} />{/if}
        {/if}
        <span class="truncate">{group.label}</span>
        <span class="font-normal text-fg3">{group.issues.length}</span>
      </h3>
    {/if}
    <ul>
      {#each group.issues as issue (issue.id)}
        <IssueRow {issue} {showProject} hideState={groupBy === 'state'} onchange={patch} />
      {/each}
    </ul>
  </section>
{/each}
