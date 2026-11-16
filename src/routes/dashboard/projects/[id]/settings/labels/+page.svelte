<script lang="ts">
  import { m } from '@/lib/i18n';
  import LabelsSettings from '@/lib/components/settings/labels/labels-settings.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.settings_page_labels_title({ name: data.projectName })}</title>
</svelte:head>

<h1 class="text-xl font-medium">{m.common_labels()}</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  {m.settings_page_labels_desc()}{!data.canEdit ? ` ${m.settings_page_labels_guests()}` : ''}
</p>
<LabelsSettings projectId={data.projectId} counts={data.counts} canEdit={data.canEdit} />
