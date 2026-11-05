<script lang="ts">
  import ImportExportPanel from '@/lib/components/import/import-export-panel.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Import / export</title>
</svelte:head>

<h1 class="text-xl font-medium">Import / export</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  Move issues in from CSV, Jira, GitHub Issues, Asana or Shortcut, or take them out as CSV / JSON.
</p>
<ImportExportPanel projectId={data.projectId} canImport={data.canImport} />
