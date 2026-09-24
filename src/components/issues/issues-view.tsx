'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ListTodo, Plus, SearchX } from 'lucide-react';

import { IssueDetailPane } from '@/components/issue-detail/issue-detail-pane';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui-icons';
import { registerPaletteCommands } from '@/lib/palette-commands';
import {
  STATUS_ORDER,
  VIEW_COOKIE,
  filterIssues,
  groupByStatus,
  type IssueAssignee,
  type IssueRow,
  type TicketStatus,
} from '@/lib/issue-model';
import { IssueFilters, applyFilters, setSearchParams, useIssueFilters } from './issue-filters';
import { NewIssueDialog } from './new-issue-dialog';
import { isPendingIssue, useIssueMutations } from './use-issue-mutations';
import { ViewSwitcher } from './view-switcher';
import { ISSUE_VIEWS, preloadViews } from './views';

export function IssuesView({
  projectId,
  ticketKey,
  issues,
  members,
  defaultView,
}: {
  projectId: string;
  ticketKey: string;
  issues: IssueRow[];
  members: IssueAssignee[];
  /** Last view chosen this browser session; a `view` URL param wins. */
  defaultView?: string;
}) {
  const mutations = useIssueMutations(projectId, ticketKey, issues);
  const searchParams = useSearchParams();
  const filters = useIssueFilters();
  const [create, setCreate] = useState<{ open: boolean; status: TicketStatus }>({
    open: false,
    status: 'backlog',
  });

  const openCreate = (status: TicketStatus = 'backlog') =>
    setCreate({ open: true, status });
  const onPaletteCreate = useEffectEvent(() => openCreate());

  useEffect(
    () =>
      registerPaletteCommands([
        {
          id: 'new-issue',
          label: 'New issue',
          section: 'Issues',
          keywords: ['create', 'ticket'],
          run: () => onPaletteCreate(),
        },
      ]),
    [],
  );

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

  const visible = filters.statuses.length ? filters.statuses : STATUS_ORDER;
  const listed = filterIssues(mutations.issues, filters);
  const groups = groupByStatus(listed).filter((g) => visible.includes(g.status));
  const filtered = filters.statuses.length > 0 || filters.assignee !== null;

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
          <Button size="sm" onClick={() => openCreate()}>
            <Plus />
            New issue
          </Button>
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
          <Button
            size="sm"
            variant="outline"
            onClick={() => applyFilters({ statuses: [], assignee: null })}
          >
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
        <IssueFilters members={members} />
        <Button size="sm" className="ml-auto" onClick={() => openCreate()}>
          <Plus />
          New issue
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">{body}</div>
        {selected && (
          <IssueDetailPane
            issue={selected}
            members={members}
            mutations={mutations}
            onClose={closeIssue}
          />
        )}
      </div>

      <NewIssueDialog
        open={create.open}
        status={create.status}
        onOpenChange={(open) => setCreate((c) => ({ ...c, open }))}
        onCreate={mutations.create}
      />
    </div>
  );
}
