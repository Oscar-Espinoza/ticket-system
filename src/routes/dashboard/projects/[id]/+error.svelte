<!--
  Errors in pages under a project, rendered inside the project layout.
  404 → "Project not found" (port of src/app/dashboard/projects/[id]/not-found.tsx,
  which Next showed for notFound() from these pages). Other errors → the
  dashboard error state (src/app/dashboard/error.tsx; Next rendered it in place
  of the whole project layout, SvelteKit keeps the project header around it).
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
