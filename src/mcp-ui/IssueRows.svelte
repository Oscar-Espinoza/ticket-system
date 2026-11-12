<script lang="ts">
  // Issue rows, optionally grouped. A write inside an expanded row patches the
  // row (state, assignee, labels…) without a new list call.
  import type { IssueDetail, IssueSummary } from '@/lib/server/mcp/contracts';
  import { groupIssues, type IssueGroup } from './lib/model';
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
  type Item = { kind: 'group'; key: string; group: IssueGroup } | { kind: 'row'; key: string; issue: IssueSummary };
  const items = $derived<Item[]>(
    groups.flatMap((group) => [
      ...(group.label ? [{ kind: 'group' as const, key: `g:${group.key}`, group }] : []),
      ...group.issues.map((issue) => ({ kind: 'row' as const, key: `r:${issue.id}`, issue })),
    ]),
  );

  function patch(next: IssueDetail) {
    const { description: _d, creator: _c, cycle: _cy, epic: _e, parent: _p, subIssues: _s, relations: _r, comments: _co, commentCount: _cc, archivedAt: _a, deletedAt: _de, createdAt: _cr, ...summary } = next;
    patches = { ...patches, [next.id]: summary };
  }
</script>

<!-- One flat, keyed list: group headers and rows alike. A row that moves to another group (a state change in
     its expanded detail) is moved, not re-created, so it stays expanded and keeps its "Done" message. -->
<ul>
  {#each items as item (item.key)}
    {#if item.kind === 'group'}
      <li role="none">
        <h3 class="sticky top-0 z-10 flex items-center gap-2 bg-bg2 px-1.5 py-1 font-semibold text-fg2">
          {#if groupBy === 'state' && item.group.issues[0]}
            {@const sample = item.group.issues[0]}
            <StateIcon type={sample.state.type} color={sample.state.color} />
          {/if}
          <span class="truncate">{item.group.label}</span>
          <span class="font-normal text-fg3">{item.group.issues.length}</span>
        </h3>
      </li>
    {:else}
      <IssueRow issue={item.issue} {showProject} hideState={groupBy === 'state'} onchange={patch} />
    {/if}
  {/each}
</ul>
