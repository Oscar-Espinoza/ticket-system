<!--
  Rendered at the end of the issues toolbar (before "New issue"):
  "Save view" on the project issues page; "Update view" / "Save as new" on a
  saved view page (known through our SavedViewProvider, else IssuesView's
  view context or the `savedView` prop).
  Cycle / epic pages list a scoped subset a view wouldn't capture, so they get
  nothing here. Port of src/components/issues/slots/toolbar-extra.tsx.
-->
<script lang="ts">
  import BookmarkPlusIcon from '@lucide/svelte/icons/bookmark-plus';
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
  import SaveIcon from '@lucide/svelte/icons/save';
  import { toast } from 'svelte-sonner';

  import { page } from '$app/state';

  import { updateView } from '@/lib/actions/views';
  import { normalizeDisplayOptions, useDisplayOptions } from '@/lib/components/issues/display-options.svelte';
  import { useIssueFilters } from '@/lib/components/issues/issue-filters.svelte.ts';
  import SaveViewDialog from '@/lib/components/navigation/save-view-dialog.svelte';
  import { canonicalJson, useSavedView } from '@/lib/components/navigation/saved-view-context.svelte';
  import { useOptionalProjectData } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { useSavedView as useShownSavedView } from '@/lib/components/views/view-context.svelte';
  import { normalizeIssueFilters } from '@/lib/issue-filtering';
  import type { IssueRow } from '@/lib/issue-model';
  import { roleAllows } from '@/lib/roles';

  type Json = Record<string, unknown>;

  let {
    issues,
    savedView,
  }: {
    /** The currently listed issues. */
    issues: IssueRow[];
    savedView?: { id: string; name: string } | null;
  } = $props();
  // `issues` is part of the slot contract (React ignored it too).

  const data = useOptionalProjectData();
  const openViewRef = useSavedView();
  // IssuesView's own record of a shown saved view (when not opened via our page).
  const shownViewRef = useShownSavedView();
  const filtersRef = useIssueFilters();
  const display = useDisplayOptions();
  let dialog = $state(0); // >0 = open; bumps remount the form
  let open = $state(false);
  let saving = $state(false);

  const openView = $derived(openViewRef.current);
  const shownView = $derived(shownViewRef.current ?? savedView ?? null);
  const canShare = $derived(data ? roleAllows(data.project.role, 'write') : false);
  const onIssuesPage = $derived(data ? page.url.pathname === `/dashboard/projects/${data.project.id}` : false);
  const onViewPage = $derived(openView !== null || shownView !== null);

  const current = $derived({
    filters: filtersRef.current as unknown as Json,
    display: display.current as unknown as Json,
  });
  // Normalize both sides: stored JSON may lack fields added since it was saved.
  const dirty = $derived(
    openView !== null &&
      (canonicalJson(normalizeIssueFilters(openView.filters)) !==
        canonicalJson(normalizeIssueFilters(current.filters)) ||
        canonicalJson(normalizeDisplayOptions(openView.display)) !==
          canonicalJson(normalizeDisplayOptions(current.display))),
  );

  const openDialog = () => {
    dialog += 1;
    open = true;
  };

  async function update() {
    const view = openView;
    if (!view) return;
    saving = true;
    try {
      const result = await updateView({ id: view.id, ...current });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Updated “${view.name}”`);
      // updateView's wrapper refreshes the page (React: router.refresh()).
    } finally {
      saving = false;
    }
  }
</script>

{#if data && (onIssuesPage || onViewPage)}
  {#if openView?.isOwner}
    <Button
      size="sm"
      variant={dirty ? 'secondary' : 'ghost'}
      disabled={!dirty || saving}
      title={dirty ? 'Save the current filters and display to this view' : 'No unsaved changes'}
      onclick={update}
    >
      {#if saving}<LoaderCircleIcon class="animate-spin" />{:else}<SaveIcon />{/if}
      Update view
    </Button>
  {/if}
  <Button size="sm" variant="ghost" onclick={openDialog}>
    <BookmarkPlusIcon />
    {onViewPage ? 'Save as new' : 'Save view'}
  </Button>
  {#if dialog > 0}
    {#key dialog}
      <SaveViewDialog
        {open}
        onOpenChange={(next: boolean) => (open = next)}
        projectId={data.project.id}
        filters={current.filters}
        display={current.display}
        {canShare}
        defaultName={onViewPage ? `${openView?.name ?? shownView?.name ?? 'View'} (copy)` : ''}
      />
    {/key}
  {/if}
{/if}
