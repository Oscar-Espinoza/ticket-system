<script lang="ts">
  import { m } from '@/lib/i18n';
  import TemplateSettings from '@/lib/components/productivity/template-settings.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{m.settings_page_templates()}</title>
</svelte:head>

<h1 class="text-xl font-medium">{m.settings_page_templates()}</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  {m.settings_page_templates_desc()}
</p>
<TemplateSettings
  projectId={data.projectId}
  templates={data.templates}
  canEdit={data.canEdit}
/>
