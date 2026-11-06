<script lang="ts">
  import EpicDetail from '@/lib/components/epics/epic-detail.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{data.epic.name}</title>
</svelte:head>

<!-- Remount per epic so drafts and pending
     optimistic ops never carry over from one epic to the next. -->
{#key data.epic.id}
<EpicDetail
  epic={data.epic}
  milestones={data.milestones}
  updates={data.updates}
  issues={data.issues}
  issueProjects={data.issueProjects}
  labels={data.labels}
  relations={data.relations}
  documents={data.documents}
  initiatives={data.initiatives}
  workspaceSlug={data.workspaceSlug}
  defaultView={data.defaultView}
/>
{/key}
