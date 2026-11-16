<script lang="ts">
  import { m } from '@/lib/i18n';
  import ProjectGeneralForm from '@/lib/components/settings/project-general-form.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.settings_page_general_title({ name: data.projectName })}</title>
</svelte:head>

<h1 class="text-xl font-medium">{m.settings_page_general()}</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">{m.settings_page_general_desc()}</p>
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
