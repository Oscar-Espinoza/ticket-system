<script lang="ts">
  import TemplatesManager from '@/lib/components/project-templates/templates-manager.svelte';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();
</script>

<svelte:head><title>Project templates · Ticket System</title></svelte:head>

<TemplatesManager templates={data.templates} projects={data.projects} workspaces={data.workspaces} />
