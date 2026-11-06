<!-- Activity history + comments (src/lib/components/comments). -->
<script lang="ts">
  import { IssueActivity } from '@/lib/components/comments';
  import RichEditorProvider from '@/lib/components/editor/rich-editor-provider.svelte';
  import { isPendingIssue, type IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import type { IssueRow } from '@/lib/issue-model';

  let { issue }: { issue: IssueRow; mutations: IssueMutations } = $props();
</script>

<!-- A just-created issue has no server id yet. -->
{#if !isPendingIssue(issue)}
  <!-- Images pasted into comments become attachments of this issue. -->
  <RichEditorProvider value={{ projectId: issue.projectId, ticketId: issue.id }}>
    <IssueActivity {issue} />
  </RichEditorProvider>
{/if}
