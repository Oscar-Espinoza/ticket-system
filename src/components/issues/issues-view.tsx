'use client';

import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { Layers2, ListTodo, Plus, SearchX } from 'lucide-react';

import { IssueDetailPane } from '@/components/issue-detail/issue-detail-pane';
import { useProjectData, useProjectPermission } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui-icons';
import { DisplayMenu } from '@/components/views/display-menu';
import { IssuesViewContextProvider, type SubIssueCount } from '@/components/views/view-context';
import { registerPaletteCommands } from '@/lib/palette-commands';
import {
  EMPTY_FILTERS,
  filterIssues,
  filtersKey,
  isFilterActive,
  normalizeIssueFilters,
  type IssueFilters as Filters,
} from '@/lib/issue-filtering';
import { groupIssues, sortIssues } from '@/lib/issue-grouping';
import { VIEW_COOKIE, type IssuePatch, type IssueRow } from '@/lib/issue-model';
import { isClosed } from '@/lib/workflow';
import {
  DisplayOptionsProvider,
  isViewLayout,
  normalizeDisplayOptions,
  useDisplayOptions,
  type DisplayOptions,
  type ViewLayout,
} from './display-options';
import { IssueContextMenu } from './issue-context-menu';
import { IssueFilters, IssueFiltersProvider, setSearchParams, useIssueFilters, useSetIssueFilters } from './issue-filters';
import { NewIssueDialog } from './new-issue-dialog';
import { BulkBar } from './slots/bulk-bar';
import { IssueShortcuts } from './slots/issue-shortcuts';
import { IssueSelectionProvider } from './selection';
import { ListOverlay } from './slots/list-overlay';
import { ToolbarExtra } from './slots/toolbar-extra';
import { isPendingIssue, useIssueMutations } from './use-issue-mutations';
import { ViewSwitcher } from './view-switcher';
import { ISSUE_VIEWS, preloadViews } from './views';

type JsonObject = Record<string, unknown>;

export interface IssuesViewProps {
  /** Server issues (e.g. the project's active issues, a cycle's, an epic's). */
  issues: IssueRow[];
  /** Last layout chosen this browser session (cookie); a `view` URL param wins. */
  defaultView?: string;
  /** Merged into every new issue created here (cycle / epic pages). */
  createDefaults?: IssuePatch;
  /** Saved view filters (JSON) — used when the URL carries none. */
  initialFilters?: Partial<Filters> | JsonObject;
  /** Saved view display options (JSON); not persisted to localStorage. */
  initialDisplay?: Partial<DisplayOptions> | JsonObject;
  /** The saved view being shown (name in the toolbar, dirty tracking). */
  savedView?: { id: string; name: string };
  /** Replaces the "No issues yet" state when there are no issues at all. */
  emptyState?: ReactNode;
}

export function IssuesView(props: IssuesViewProps) {
  // Another saved view on the same route starts from its own filters/display.
  return <IssuesViewRoot key={props.savedView?.id ?? 'issues'} {...props} />;
}

function IssuesViewRoot(props: IssuesViewProps) {
  const [initialFilters] = useState(() =>
    props.initialFilters ? normalizeIssueFilters(props.initialFilters) : undefined,
  );
  let content = (
    <IssueFiltersProvider initial={initialFilters}>
      <IssuesViewBody {...props} initialFilters={initialFilters} />
    </IssueFiltersProvider>
  );
  if (props.initialDisplay) {
    content = (
      <DisplayOptionsProvider initial={props.initialDisplay} persist={false}>
        {content}
      </DisplayOptionsProvider>
    );
  }
  return content;
}

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

function IssuesViewBody({
  issues,
  defaultView,
  createDefaults,
  initialFilters,
  initialDisplay,
  savedView,
  emptyState,
}: Omit<IssuesViewProps, 'initialFilters'> & { initialFilters?: Filters }) {
  const data = useProjectData();
  const canWrite = useProjectPermission('write');
  const [display, setDisplay] = useDisplayOptions();
  const mutations = useIssueMutations(issues);
  const searchParams = useSearchParams();
  const filters = useIssueFilters();
  const setFilters = useSetIssueFilters();
  // A fresh `defaults` object per open resets the dialog's properties.
  const [create, setCreate] = useState<{ open: boolean; defaults: IssuePatch }>({
    open: false,
    defaults: {},
  });

  const openCreate = (patch: IssuePatch | null = null) =>
    setCreate({ open: true, defaults: { ...createDefaults, ...patch } });
  const onPaletteCreate = useEffectEvent(() => openCreate());

  useEffect(() => {
    if (!canWrite) return;
    return registerPaletteCommands([
      {
        id: 'new-issue',
        label: 'New issue',
        section: 'Issues',
        keywords: ['create', 'ticket'],
        run: () => onPaletteCreate(),
      },
    ]);
  }, [canWrite]);

  // Fetch the other views' code while idle so the first switch doesn't wait on it.
  useEffect(() => {
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(preloadViews);
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(preloadViews, 1500);
    return () => clearTimeout(id);
  }, []);

  // Layout: URL first, then (plain lists) the session cookie, then display options.
  const urlView = searchParams.get('view');
  const layout: ViewLayout = isViewLayout(urlView)
    ? urlView
    : !savedView && isViewLayout(defaultView)
      ? defaultView
      : display.layout;
  const view = ISSUE_VIEWS.find((v) => v.id === layout) ?? ISSUE_VIEWS[0];

  const switchView = (id: string) => {
    if (!isViewLayout(id)) return;
    // Session cookie: remembered across navigation until the browser closes.
    if (!savedView) document.cookie = `${VIEW_COOKIE}=${id}; path=/; samesite=lax`;
    setSearchParams({ view: id });
    if (display.layout !== id) setDisplay({ ...display, layout: id });
  };
  const View = view.component;

  const filtered = isFilterActive(filters);
  let listed = filterIssues(mutations.issues, filters, {
    viewerId: data.viewer.id,
    allIssues: mutations.issues,
  });
  if (!display.showSubIssues) {
    // Sub-issues fold into their parent (count chip) when it's listed too.
    const ids = new Set(listed.map((i) => i.id));
    listed = listed.filter((issue) => !issue.parentId || !ids.has(issue.parentId));
  }
  listed = sortIssues(listed, display.orderBy);
  let groups = groupIssues(listed, display.groupBy, data);
  // A status filter also limits the state groups (columns) shown.
  if (filters.stateIds.length > 0 || filters.stateTypes.length > 0) {
    groups = groups.filter(
      (g) =>
        g.kind !== 'state' ||
        filters.stateIds.includes(g.id) ||
        (g.state !== undefined && filters.stateTypes.includes(g.state.type)),
    );
  }

  const dirty =
    savedView !== undefined &&
    (filtersKey(filters) !== filtersKey(initialFilters ?? EMPTY_FILTERS) ||
      JSON.stringify(display) !== JSON.stringify(normalizeDisplayOptions(initialDisplay)));
  const context = {
    subIssues: subIssueCounts(mutations.issues),
    savedView: savedView ? { ...savedView, dirty } : null,
  };

  const selectedKey = searchParams.get('issue');
  const selected = selectedKey
    ? (mutations.issues.find((i) => i.key === selectedKey) ?? null)
    : null;
  const openerId = useRef<string | null>(null);

  const selectIssue = (issue: IssueRow) => {
    if (isPendingIssue(issue)) return;
    openerId.current = issue.id;
    setSearchParams({ issue: issue.key });
  };

  const closeIssue = () => {
    setSearchParams({ issue: null });
    const id = openerId.current ?? selected?.id;
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(
          `[data-issue-row="${id}"], [data-board-card="${id}"], [data-issue-chip="${id}"]`,
        )
        ?.focus();
    });
  };

  let body: ReactNode;
  if (mutations.issues.length === 0 && !filtered) {
    body = emptyState ?? (
      <EmptyState
        icon={<ListTodo />}
        title="No issues yet"
        description="Create the first issue for this project."
        action={
          canWrite ? (
            <Button size="sm" onClick={() => openCreate()}>
              <Plus />
              New issue
            </Button>
          ) : undefined
        }
      />
    );
  } else if (listed.length === 0 && filtered && layout !== 'calendar') {
    body = (
      <EmptyState
        icon={<SearchX />}
        title="No matching issues"
        description="No issues match the current filters."
        action={
          <Button size="sm" variant="outline" onClick={() => setFilters({ ...EMPTY_FILTERS })}>
            Clear filters
          </Button>
        }
      />
    );
  } else {
    body = (
      <View
        groups={groups}
        issues={listed}
        mutations={mutations}
        selectedId={selected?.id ?? null}
        onSelect={selectIssue}
        onCreate={openCreate}
      />
    );
  }

  return (
    <IssuesViewContextProvider value={context}>
      <IssueSelectionProvider issues={listed}>
        <div className="group/issues flex min-h-0 flex-1 flex-col">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <ViewSwitcher views={ISSUE_VIEWS} current={view.id} onChange={switchView} />
            {savedView && (
              <span
                className="inline-flex h-7 max-w-48 items-center gap-1.5 rounded-md bg-secondary px-2 text-xs font-medium"
                title={dirty ? `${savedView.name} (unsaved changes)` : savedView.name}
              >
                <Layers2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{savedView.name}</span>
                {dirty && (
                  <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Unsaved changes" />
                )}
              </span>
            )}
            <IssueFilters />
            <div className="ml-auto flex items-center gap-2">
              <ToolbarExtra issues={listed} savedView={savedView ?? null} />
              <DisplayMenu views={ISSUE_VIEWS} layout={view.id} onLayoutChange={switchView} />
              {canWrite && (
                <Button size="sm" onClick={() => openCreate()}>
                  <Plus />
                  New issue
                </Button>
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-1">
            {/* Selection ranges, ⌘A and the context menu are scoped to this wrapper. */}
            <IssueContextMenu issues={listed} mutations={mutations}>
              {/* Room for the floating bulk bar so it never hides the last rows. */}
              <div
                data-issue-view
                className="flex min-w-0 flex-1 flex-col group-has-[[data-bulk-bar]]/issues:pb-16"
              >
                {body}
              </div>
            </IssueContextMenu>
            {selected && (
              <IssueDetailPane issue={selected} mutations={mutations} onClose={closeIssue} />
            )}
          </div>

          <IssueShortcuts issues={listed} mutations={mutations} selectedIssue={selected} />
          <ListOverlay issues={listed} onOpen={selectIssue} />
          <BulkBar issues={listed} mutations={mutations} />

          <NewIssueDialog
            open={create.open}
            defaults={create.defaults}
            onOpenChange={(open) => setCreate((c) => ({ ...c, open }))}
            onCreate={mutations.create}
          />
        </div>
      </IssueSelectionProvider>
    </IssuesViewContextProvider>
  );
}
