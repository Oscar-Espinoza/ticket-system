<!--
  Client half of the issue permalink page. The issue stays in the mutation
  scope even when archived / trashed, so archiving from the `…` menu leaves the
  page in place with IssueDetail's banner + Restore instead of blanking it.
  Port of src/components/navigation/issue-permalink.tsx.
-->
<script lang="ts">
  import IssueDetail from '@/lib/components/issue-detail/issue-detail.svelte';
  import IssueShortcuts from '@/lib/components/issues/slots/issue-shortcuts.svelte';
  import { isActiveIssue, useIssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import type { IssueRow } from '@/lib/issue-model';

  let {
    issue: serverIssue,
    projectIssues,
  }: {
    issue: IssueRow;
    /** The project's active issues (sub-issue, parent and relation pickers use them). */
    projectIssues: IssueRow[];
  } = $props();

  const serverIssues = $derived(
    projectIssues.some((i) => i.id === serverIssue.id) ? projectIssues : [serverIssue, ...projectIssues],
  );
  const mutations = useIssueMutations(
    () => serverIssues,
    () => ({ include: (i: IssueRow) => i.id === serverIssue.id || isActiveIssue(i) }),
  );
  const issue = $derived(mutations.issues.find((i) => i.id === serverIssue.id) ?? serverIssue);
</script>

<div class="mx-auto w-full max-w-6xl">
  <IssueDetail {issue} {mutations} variant="page" />
  <IssueShortcuts issues={mutations.issues} {mutations} selectedIssue={issue} />
</div>
