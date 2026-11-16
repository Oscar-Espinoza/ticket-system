<script lang="ts">
  import { m } from '@/lib/i18n';
  import WorkflowSettings from '@/lib/components/settings/workflow/workflow-settings.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.settings_page_workflow_title({ name: data.projectName })}</title>
</svelte:head>

<h1 class="text-xl font-medium">{m.settings_page_workflow()}</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  {m.settings_page_workflow_desc()}{!data.canEdit ? ` ${m.settings_page_workflow_admins()}` : ''}
</p>
<WorkflowSettings projectId={data.projectId} counts={data.counts} canEdit={data.canEdit} />
