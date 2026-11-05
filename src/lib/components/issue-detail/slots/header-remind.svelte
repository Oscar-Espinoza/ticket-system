<!--
  Owner: B2. "Remind me" — a reminder is a `reminder` notification for the
  viewer, hidden (snoozed) until the chosen time, when it surfaces in the inbox.
-->
<script lang="ts">
  import { isPendingIssue, type IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import type { IssueRow } from '@/lib/issue-model';
  import RemindButton from './remind-button.svelte';

  let { issue }: { issue: IssueRow; mutations: IssueMutations } = $props();
</script>

{#if !isPendingIssue(issue)}
  {#key issue.id}
    <RemindButton projectId={issue.projectId} ticketId={issue.id} />
  {/key}
{/if}
