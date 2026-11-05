<script lang="ts">
  import TemplateSettings from '@/lib/components/productivity/template-settings.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>Templates</title>
</svelte:head>

<h1 class="text-xl font-medium">Templates</h1>
<p class="mt-1 mb-8 text-sm text-muted-foreground">
  Starting points for new issues — a title, a description and default properties. Apply one from
  the new-issue dialog or the command palette.
</p>
<TemplateSettings
  projectId={data.projectId}
  templates={data.templates}
  canEdit={data.canEdit}
/>
