<!--
  Errors from the project layout (src/routes/dashboard/projects/[id]/+layout.server.ts):
  a 404 is "Project not found" (port of src/app/dashboard/projects/not-found.tsx —
  getProjectData returns null for outsiders, D-15, enumeration-resistant);
  anything else is the dashboard error state (src/app/dashboard/error.tsx caught
  those in Next).
-->
<script lang="ts">
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
    <title>Project not found · Ticket System</title>
  {/if}
</svelte:head>

{#if page.status === 404}
  <EmptyState title="Project not found" description="It doesn't exist, or you're not a member of it.">
    {#snippet icon()}<FolderXIcon />{/snippet}
    {#snippet action()}
      <Button size="sm" variant="outline" href="/dashboard">Back to projects</Button>
    {/snippet}
  </EmptyState>
{:else}
  <EmptyState title="Something went wrong" description="This page failed to load. Try again, or come back in a moment.">
    {#snippet icon()}<TriangleAlertIcon />{/snippet}
    {#snippet action()}
      <Button size="sm" variant="outline" onclick={() => void retry()}>Try again</Button>
    {/snippet}
  </EmptyState>
{/if}
