<script lang="ts">
  import { m } from '@/lib/i18n';
  import TemplatesManager from '@/lib/components/project-templates/templates-manager.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head><title>{m.issues_templates_page_title()}</title></svelte:head>

<TemplatesManager templates={data.templates} projects={data.projects} workspaces={data.workspaces} />
