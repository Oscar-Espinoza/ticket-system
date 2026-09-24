'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ListTodo, Plus, SearchX } from 'lucide-react';

import { IssueDetailPane } from '@/components/issue-detail/issue-detail-pane';
import { useProjectData, useProjectPermission } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui-icons';
import { registerPaletteCommands } from '@/lib/palette-commands';
import { groupIssues } from '@/lib/issue-grouping';
import {
  VIEW_COOKIE,
  filterIssues,
  hasActiveFilters,
  type IssuePatch,
  type IssueRow,
} from '@/lib/issue-model';
import { useDisplayOptions } from './display-options';
import { IssueFilters, clearFilters, setSearchParams, useIssueFilters } from './issue-filters';
import { NewIssueDialog } from './new-issue-dialog';
import { BulkBar } from './slots/bulk-bar';
import { IssueShortcuts } from './slots/issue-shortcuts';
import { ListOverlay } from './slots/list-overlay';
import { ToolbarExtra } from './slots/toolbar-extra';
import { isPendingIssue, useIssueMutations } from './use-issue-mutations';
import { ViewSwitcher } from './view-switcher';
import { ISSUE_VIEWS, preloadViews } from './views';

export function IssuesView({
  issues,
  defaultView,
}: {
  /** Server issues (the project's active issues). Everything else comes from context. */
  issues: IssueRow[];
  /** Last view chosen this browser session; a `view` URL param wins. */
  defaultView?: string;
}) {
  const data = useProjectData();
  const canWrite = useProjectPermission('write');
  const [display] = useDisplayOptions();
  const mutations = useIssueMutations(issues);
  const searchParams = useSearchParams();
  const filters = useIssueFilters();
  // A fresh `defaults` object per open resets the dialog's properties.
  const [create, setCreate] = useState<{ open: boolean; defaults: IssuePatch }>({
    open: false,
    defaults: {},
  });

  const openCreate = (patch: IssuePatch | null = null) =>
    setCreate({ open: true, defaults: { ...patch } });
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

  const view =
    ISSUE_VIEWS.find((v) => v.id === (searchParams.get('view') ?? defaultView)) ??
    ISSUE_VIEWS[0];

  const switchView = (id: string) => {
    // Session cookie: remembered across navigation until the browser closes.
    document.cookie = `${VIEW_COOKIE}=${id}; path=/; samesite=lax`;
    setSearchParams({ view: id });
  };
  const View = view.component;

  const filtered = hasActiveFilters(filters);
  let listed = filterIssues(mutations.issues, filters);
  if (!display.showSubIssues) listed = listed.filter((issue) => issue.parentId === null);
  let groups = groupIssues(listed, display.groupBy, data);
  // A status filter also limits the state groups (columns) shown.
  if (filters.stateIds.length > 0) {
    groups = groups.filter((g) => g.kind !== 'state' || filters.stateIds.includes(g.id));
  }

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
        .querySelector<HTMLElement>(`[data-issue-row="${id}"], [data-board-card="${id}"]`)
        ?.focus();
    });
  };

  let body: React.ReactNode;
  if (mutations.issues.length === 0 && !filtered) {
    body = (
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
  } else if (listed.length === 0 && filtered) {
    body = (
      <EmptyState
        icon={<SearchX />}
        title="No matching issues"
        description="No issues match the current filters."
        action={
          <Button size="sm" variant="outline" onClick={clearFilters}>
            Clear filters
          </Button>
        }
      />
    );
  } else {
    body = (
      <View
        groups={groups}
        mutations={mutations}
        selectedId={selected?.id ?? null}
        onSelect={selectIssue}
        onCreate={openCreate}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ViewSwitcher views={ISSUE_VIEWS} current={view.id} onChange={switchView} />
        <IssueFilters />
        <div className="ml-auto flex items-center gap-2">
          <ToolbarExtra issues={listed} />
          {canWrite && (
            <Button size="sm" onClick={() => openCreate()}>
              <Plus />
              New issue
            </Button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">{body}</div>
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
  );
}
