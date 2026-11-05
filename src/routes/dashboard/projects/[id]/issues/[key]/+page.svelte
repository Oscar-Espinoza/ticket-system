<!-- Issue permalink page (port of src/app/dashboard/projects/[id]/issues/[key]/page.tsx). -->
<script lang="ts">
  import IssuePermalink from '@/lib/components/navigation/issue-permalink.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{`${data.issue.key} ${data.issue.title}`} · Ticket System</title>
</svelte:head>

<IssuePermalink issue={data.issue} projectIssues={data.projectIssues} />
