<script lang="ts">
  import WorkflowSettings from '@/lib/components/settings/workflow/workflow-settings.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Workflow · {data.projectName}</title>
</svelte:head>

<h1 class="text-xl font-medium">Workflow</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  The states issues move through, grouped by type. The type decides how a state behaves: started
  states set a start date, completed and canceled states close the issue.{!data.canEdit
    ? ' Only admins can change the workflow.'
    : ''}
</p>
<WorkflowSettings projectId={data.projectId} counts={data.counts} canEdit={data.canEdit} />
