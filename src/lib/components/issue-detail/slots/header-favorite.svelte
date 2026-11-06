<!-- Star / unstar the issue from the detail header. -->
<script lang="ts">
  import FavoriteButton from '@/lib/components/navigation/favorite-button.svelte';
  import { isPendingIssue, type IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import type { IssueRow } from '@/lib/issue-model';

  let { issue }: { issue: IssueRow; mutations: IssueMutations } = $props();
</script>

{#if !isPendingIssue(issue)}
  <!-- Keyed by id: switching issues in the pane must not show the previous star. -->
  {#key issue.id}
    <FavoriteButton targetType="issue" targetId={issue.id} />
  {/key}
{/if}
