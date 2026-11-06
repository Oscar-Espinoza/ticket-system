<script lang="ts">
  import IssuePermalink from '@/lib/components/navigation/issue-permalink.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<!--
  No " · Ticket System" suffix: issue pages are titled "KEY Title" only.
-->
<svelte:head>
  <title>{`${data.issue.key} ${data.issue.title}`}</title>
</svelte:head>

<IssuePermalink issue={data.issue} projectIssues={data.projectIssues} />
