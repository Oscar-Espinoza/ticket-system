<!--
  Errors from the project layout (src/routes/dashboard/projects/[id]/+layout.server.ts):
  a 404 is "Project not found" (getProjectData returns null for outsiders,
  enumeration-resistant); anything else is the dashboard error state.
-->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import FolderXIcon from '@lucide/svelte/icons/folder-x';
  import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

  import { Button } from '@/lib/components/ui/button';
  import { EmptyState } from '@/lib/components/ui-icons';

  $effect(() => {
    if (page.status !== 404) console.error(page.error);
  });

  // unstable_retry(): re-run the loads and re-render the segment.
  const retry = () => goto(page.url.href, { replace: true, refreshAll: true, reset: false });
</script>

<svelte:head>
  {#if page.status === 404}
    <!-- generateMetadata of the project layout. -->
    <title>{m.projects_project_not_found_title()}</title>
  {/if}
</svelte:head>

{#if page.status === 404}
  <EmptyState title={m.projects_project_not_found()} description={m.projects_project_not_found_desc()}>
    {#snippet icon()}<FolderXIcon />{/snippet}
    {#snippet action()}
      <Button size="sm" variant="outline" href="/dashboard">{m.projects_back_to_projects()}</Button>
    {/snippet}
  </EmptyState>
{:else}
  <EmptyState title={m.projects_error_title()} description={m.projects_error_desc()}>
    {#snippet icon()}<TriangleAlertIcon />{/snippet}
    {#snippet action()}
      <Button size="sm" variant="outline" onclick={() => void retry()}>{m.common_retry()}</Button>
    {/snippet}
  </EmptyState>
{/if}
