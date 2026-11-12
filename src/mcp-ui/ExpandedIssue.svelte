<script lang="ts">
  // The inline detail under an expanded list row: loads the issue with
  // get_issue (a tool of this server, through the host) and shows it.
  import type { IssueDetail } from '@/lib/server/mcp/contracts';
  import { callTool } from './lib/app.svelte';
  import ErrorState from './ErrorState.svelte';
  import IssueDetailView from './IssueDetail.svelte';

  let { issueKey, onchange }: { issueKey: string; onchange?: (issue: IssueDetail) => void } = $props();

  let detail = $state.raw<IssueDetail | null>(null);
  let error = $state('');
  let loading = $state(true);

  $effect(() => {
    let current = true;
    loading = true;
    error = '';
    void callTool('get_issue', { key: issueKey }).then((result) => {
      if (!current) return;
      loading = false;
      if (result.ok && result.content?.view === 'issue-detail') detail = result.content.issue;
      else error = result.text || 'Could not load the issue.';
    });
    return () => {
      current = false;
    };
  });
</script>

{#if loading}
  <p class="py-2 text-fg2" role="status">Loading…</p>
{:else if error}
  <ErrorState message={error} title="Could not open the issue" />
{:else if detail}
  <IssueDetailView
    issue={detail}
    compact
    onupdate={(next) => {
      detail = next;
      onchange?.(next);
    }}
  />
{/if}
