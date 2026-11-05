<script lang="ts">
  import ProjectGeneralForm from '@/lib/components/settings/project-general-form.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Settings · {data.projectName}</title>
</svelte:head>

<h1 class="text-xl font-medium">General</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">Name, issue key and defaults for this project.</p>
<ProjectGeneralForm
  projectId={data.projectId}
  name={data.name}
  ticketKey={data.ticketKey}
  description={data.description}
  estimateScale={data.estimateScale}
  canEdit={data.canEdit}
  isOwner={data.isOwner}
  workspaceId={data.workspaceId}
  workspaceName={data.workspaceName}
  parentId={data.parentId}
  parentOptions={data.parentOptions}
  visibility={data.visibility}
  templateWorkspaces={data.templateWorkspaces}
/>
