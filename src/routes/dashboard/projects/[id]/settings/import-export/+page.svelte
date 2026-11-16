<script lang="ts">
  import { m } from '@/lib/i18n';
  import ImportExportPanel from '@/lib/components/import/import-export-panel.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.settings_page_import_export()}</title>
</svelte:head>

<h1 class="text-xl font-medium">{m.settings_page_import_export()}</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  {m.settings_page_import_export_desc()}
</p>
<ImportExportPanel projectId={data.projectId} canImport={data.canImport} />
