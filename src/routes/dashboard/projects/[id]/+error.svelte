<!--
  Errors in pages under a project, rendered inside the project layout.
  404 → "Project not found". Other errors → the dashboard error state, with the
  project header kept around it.
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

  // A page-level miss is titled by its own message ("Issue not found"; no
  // suffix under a project).
  const specificMessage = $derived(
    page.error?.message && !/^not found$/i.test(page.error.message) ? page.error.message : null,
  );
</script>

<svelte:head>
  {#if page.status === 404 && specificMessage}
    <title>{specificMessage}</title>
  {/if}
</svelte:head>

{#if page.status === 404}
  <EmptyState title={m.issues_project_not_found()} description={m.issues_project_not_found_description()}>
    {#snippet icon()}<FolderXIcon />{/snippet}
    {#snippet action()}
      <Button size="sm" variant="outline" href="/dashboard">{m.issues_back_to_projects()}</Button>
    {/snippet}
  </EmptyState>
{:else}
  <EmptyState title={m.issues_error_title()} description={m.issues_error_load_description()}>
    {#snippet icon()}<TriangleAlertIcon />{/snippet}
    {#snippet action()}
      <Button size="sm" variant="outline" onclick={() => void retry()}>{m.common_retry()}</Button>
    {/snippet}
  </EmptyState>
{/if}
