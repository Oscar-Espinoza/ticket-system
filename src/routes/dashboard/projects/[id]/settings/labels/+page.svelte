<script lang="ts">
  import LabelsSettings from '@/lib/components/settings/labels/labels-settings.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Labels · {data.projectName} · Ticket System</title>
</svelte:head>

<h1 class="text-xl font-medium">Labels</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  Labels categorize issues in this project.{!data.canEdit ? ' Guests can’t change labels.' : ''}
</p>
<LabelsSettings projectId={data.projectId} counts={data.counts} canEdit={data.canEdit} />
