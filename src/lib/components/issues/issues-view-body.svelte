<!-- Everything below the filter / display providers. -->
<script lang="ts">
  import LayersIcon from '@lucide/svelte/icons/layers-2';
  import ListTodoIcon from '@lucide/svelte/icons/list-todo';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import SearchXIcon from '@lucide/svelte/icons/search-x';

  import IssueDetailPane from '@/lib/components/issue-detail/issue-detail-pane.svelte';
  import { useProjectData, useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { EmptyState } from '@/lib/components/ui-icons';
  import DisplayMenu from '@/lib/components/views/display-menu.svelte';
  import IssuesViewContextProvider from '@/lib/components/views/issues-view-context-provider.svelte';
  import type { SubIssueCount } from '@/lib/components/views/view-context.svelte';
  import { afterFrame } from '@/lib/svelte/focus';
  import { registerPaletteCommands } from '@/lib/svelte/palette-commands.svelte';
  import { useSearchParams } from '@/lib/svelte/search-params.svelte';
  import {
    EMPTY_FILTERS,
    filterIssues,
    filtersKey,
    isFilterActive,
    type IssueFilters as Filters,
  } from '@/lib/issue-filtering';
  import { groupIssues, sortIssues } from '@/lib/issue-grouping';
  import { VIEW_COOKIE, type IssuePatch, type IssueRow } from '@/lib/issue-model';
  import { cn } from '@/lib/utils';
  import { isClosed } from '@/lib/workflow';
  import { isViewLayout, normalizeDisplayOptions, useDisplayOptions, type ViewLayout } from './display-options.svelte';
  import IssueContextMenu from './issue-context-menu.svelte';
  import { focusIssueElement } from './issue-dom';
  import IssueFilters from './issue-filters.svelte';
  import { setSearchParams, useIssueFilters, useSetIssueFilters } from './issue-filters.svelte.ts';
  import IssueSelectionProvider from './issue-selection-provider.svelte';
  import type { IssuesViewProps } from './issues-view.svelte';
  import IssueViewHost from './issue-view-host.svelte';
  import NewIssueDialog from './new-issue-dialog.svelte';
  import BulkBar from './slots/bulk-bar.svelte';
  import IssueShortcuts from './slots/issue-shortcuts.svelte';
  import ListOverlay from './slots/list-overlay.svelte';
  import ToolbarExtra from './slots/toolbar-extra.svelte';
  import { isPendingIssue, useIssueMutations } from './use-issue-mutations.svelte';
  import ViewSwitcher from './view-switcher.svelte';
  import { ISSUE_VIEWS, preloadViews } from './views';

  let {
    issues,
    defaultView,
    createDefaults,
    initialFilters,
    initialDisplay,
    savedView,
    emptyState,
  }: Omit<IssuesViewProps, 'initialFilters'> & { initialFilters?: Filters } = $props();

  function subIssueCounts(issues: IssueRow[]): Map<string, SubIssueCount> {
    const counts = new Map<string, SubIssueCount>();
    for (const issue of issues) {
      if (!issue.parentId) continue;
      const count = counts.get(issue.parentId) ?? { total: 0, done: 0 };
      count.total += 1;
      if (isClosed(issue.state.type)) count.done += 1;
      counts.set(issue.parentId, count);
    }
    return counts;
  }

  const data = useProjectData();
  const canWrite = useProjectPermission('write');
  const displayOptions = useDisplayOptions();
  const mutations = useIssueMutations(() => issues);
  const searchParams = useSearchParams();
  const filtersState = useIssueFilters();
  const setFilters = useSetIssueFilters();
  // A fresh `defaults` object per open resets the dialog's properties.
  let create = $state.raw<{ open: boolean; defaults: IssuePatch }>({ open: false, defaults: {} });

  const openCreate = (patch: IssuePatch | null = null) => {
    create = { open: true, defaults: { ...createDefaults, ...patch } };
  };

  $effect(() => {
    if (!canWrite.current) return;
    return registerPaletteCommands([
      {
        id: 'new-issue',
        label: 'New issue',
        section: 'Issues',
        keywords: ['create', 'ticket'],
        run: () => openCreate(),
      },
    ]);
  });

  // Fetch the other views' code while idle so the first switch doesn't wait on it.
  $effect(() => {
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(preloadViews);
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(preloadViews, 1500);
    return () => clearTimeout(id);
  });

  const display = $derived(displayOptions.current);
  const filters = $derived(filtersState.current);

  // Layout: URL first, then (plain lists) the session cookie, then display options.
  const layout: ViewLayout = $derived.by(() => {
    const urlView = searchParams.get('view');
    return isViewLayout(urlView) ? urlView : !savedView && isViewLayout(defaultView) ? defaultView : display.layout;
  });
  const view = $derived(ISSUE_VIEWS.find((v) => v.id === layout) ?? ISSUE_VIEWS[0]);

  const switchView = (id: string) => {
    if (!isViewLayout(id)) return;
    // Session cookie: remembered across navigation until the browser closes.
    if (!savedView) document.cookie = `${VIEW_COOKIE}=${id}; path=/; samesite=lax`;
    setSearchParams({ view: id });
    if (display.layout !== id) displayOptions.set({ ...display, layout: id });
  };

  const filtered = $derived(isFilterActive(filters));
  const listed = $derived.by(() => {
    let list = filterIssues(mutations.issues, filters, {
      viewerId: data.viewer.id,
      allIssues: mutations.issues,
    });
    if (!display.showSubIssues) {
      // Sub-issues fold into their parent (count chip) when it's listed too.
      const ids = new Set(list.map((i) => i.id));
      list = list.filter((issue) => !issue.parentId || !ids.has(issue.parentId));
    }
    return sortIssues(list, display.orderBy);
  });
  const groups = $derived.by(() => {
    let result = groupIssues(listed, display.groupBy, data);
    // A status filter also limits the state groups (columns) shown.
    if (filters.stateIds.length > 0 || filters.stateTypes.length > 0) {
      result = result.filter(
        (g) =>
          g.kind !== 'state' ||
          filters.stateIds.includes(g.id) ||
          (g.state !== undefined && filters.stateTypes.includes(g.state.type)),
      );
    }
    return result;
  });

  const dirty = $derived(
    savedView !== undefined &&
      (filtersKey(filters) !== filtersKey(initialFilters ?? EMPTY_FILTERS) ||
        JSON.stringify(display) !== JSON.stringify(normalizeDisplayOptions(initialDisplay))),
  );
  const context = $derived({
    subIssues: subIssueCounts(mutations.issues),
    savedView: savedView ? { ...savedView, dirty } : null,
  });

  const selected = $derived.by(() => {
    const selectedKey = searchParams.get('issue');
    return selectedKey ? (mutations.issues.find((i) => i.key === selectedKey) ?? null) : null;
  });
  let openerId: string | null = null;

  const selectIssue = (issue: IssueRow) => {
    if (isPendingIssue(issue)) return;
    openerId = issue.id;
    setSearchParams({ issue: issue.key });
  };

  const closeIssue = () => {
    setSearchParams({ issue: null });
    const id = openerId ?? selected?.id;
    afterFrame(() => focusIssueElement(id));
  };
</script>

{#snippet listTodoIcon()}<ListTodoIcon />{/snippet}

{#snippet newIssueAction()}
  <Button size="sm" onclick={() => openCreate()}>
    <PlusIcon />
    New issue
  </Button>
{/snippet}

{#snippet body()}
  {#if mutations.issues.length === 0 && !filtered}
    {#if emptyState}
      {@render emptyState()}
    {:else}
      <EmptyState
        title="No issues yet"
        description="Create the first issue for this project."
        icon={listTodoIcon}
        action={canWrite.current ? newIssueAction : undefined}
      />
    {/if}
  {:else if listed.length === 0 && filtered && layout !== 'calendar'}
    <EmptyState title="No matching issues" description="No issues match the current filters.">
      {#snippet icon()}<SearchXIcon />{/snippet}
      {#snippet action()}
        <Button size="sm" variant="outline" onclick={() => setFilters({ ...EMPTY_FILTERS })}>Clear filters</Button>
      {/snippet}
    </EmptyState>
  {:else}
    <IssueViewHost
      {view}
      {groups}
      issues={listed}
      {mutations}
      selectedId={selected?.id ?? null}
      onSelect={selectIssue}
      onCreate={openCreate}
    />
  {/if}
{/snippet}

<IssuesViewContextProvider value={context}>
  <IssueSelectionProvider issues={listed}>
    <div class="group/issues flex min-h-0 flex-1 flex-col">
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <ViewSwitcher views={ISSUE_VIEWS} current={view.id} onChange={switchView} />
        {#if savedView}
          <span
            class="inline-flex h-7 max-w-48 items-center gap-1.5 rounded-md bg-secondary px-2 text-xs font-medium"
            title={dirty ? `${savedView.name} (unsaved changes)` : savedView.name}
          >
            <LayersIcon class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span class="truncate">{savedView.name}</span>
            {#if dirty}
              <span class="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Unsaved changes"></span>
            {/if}
          </span>
        {/if}
        <IssueFilters />
        <div class="ml-auto flex items-center gap-2">
          <ToolbarExtra issues={listed} savedView={savedView ?? null} />
          <DisplayMenu views={ISSUE_VIEWS} layout={view.id} onLayoutChange={switchView} />
          {#if canWrite.current}
            <Button size="sm" onclick={() => openCreate()}>
              <PlusIcon />
              New issue
            </Button>
          {/if}
        </div>
      </div>

      <div class="flex min-h-0 flex-1">
        <!-- Selection ranges, ⌘A and the context menu are scoped to this wrapper. -->
        <IssueContextMenu issues={listed} {mutations}>
          {#snippet children({ props })}
            <!-- Room for the floating bulk bar so it never hides the last rows. -->
            <div
              {...props}
              data-issue-view
              class={cn(
                props.class as string | undefined,
                'flex min-w-0 flex-1 flex-col group-has-[[data-bulk-bar]]/issues:pb-16',
              )}
            >
              {@render body()}
            </div>
          {/snippet}
        </IssueContextMenu>
        {#if selected}
          <IssueDetailPane issue={selected} {mutations} onClose={closeIssue} />
        {/if}
      </div>

      <IssueShortcuts issues={listed} {mutations} selectedIssue={selected} />
      <ListOverlay issues={listed} onOpen={selectIssue} />
      <BulkBar issues={listed} {mutations} />

      <NewIssueDialog
        open={create.open}
        defaults={create.defaults}
        onOpenChange={(open) => (create = { ...create, open })}
        onCreate={mutations.create}
      />
    </div>
  </IssueSelectionProvider>
</IssuesViewContextProvider>
