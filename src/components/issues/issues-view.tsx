'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ListTodo, Plus, SearchX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui-icons';
import { registerPaletteCommands } from '@/lib/palette-commands';
import {
  STATUS_ORDER,
  VIEW_COOKIE,
  groupByStatus,
  type IssueAssignee,
  type IssueFilters as Filters,
  type IssueRow,
  type TicketStatus,
} from '@/lib/issue-model';
import { IssueFilters, useSetSearchParams } from './issue-filters';
import { NewIssueDialog } from './new-issue-dialog';
import { useIssueMutations } from './use-issue-mutations';
import { ViewSwitcher } from './view-switcher';
import { ISSUE_VIEWS } from './views';

export function IssuesView({
  projectId,
  issues,
  members,
  filters,
  totalCount,
  defaultView,
}: {
  projectId: string;
  issues: IssueRow[];
  members: IssueAssignee[];
  filters: Filters;
  totalCount: number;
  /** Last view chosen this browser session; a `view` URL param wins. */
  defaultView?: string;
}) {
  const mutations = useIssueMutations(projectId, issues);
  const searchParams = useSearchParams();
  const setParams = useSetSearchParams();
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

  const view =
    ISSUE_VIEWS.find((v) => v.id === (searchParams.get('view') ?? defaultView)) ??
    ISSUE_VIEWS[0];

  const switchView = (id: string) => {
    // Session cookie: remembered across navigation until the browser closes.
    document.cookie = `${VIEW_COOKIE}=${id}; path=/; samesite=lax`;
    setParams({ view: id });
  };
  const View = view.component;

  const visible = filters.statuses.length ? filters.statuses : STATUS_ORDER;
  const groups = groupByStatus(mutations.issues).filter((g) =>
    visible.includes(g.status),
  );
  const filtered = filters.statuses.length > 0 || filters.assignee !== null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ViewSwitcher
          views={ISSUE_VIEWS}
          current={view.id}
          onChange={switchView}
        />
        <IssueFilters filters={filters} members={members} />
        <Button size="sm" className="ml-auto" onClick={() => openCreate()}>
          <Plus />
          New issue
        </Button>
      </div>

      {totalCount === 0 && !filtered ? (
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
      ) : mutations.issues.length === 0 && filtered ? (
        <EmptyState
          icon={<SearchX />}
          title="No matching issues"
          description="No issues match the current filters."
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => setParams({ status: null, assignee: null })}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <View
          groups={groups}
          mutations={mutations}
          selectedId={null}
          onCreate={openCreate}
        />
      )}

      <NewIssueDialog
        projectId={projectId}
        open={create.open}
        status={create.status}
        onOpenChange={(open) => setCreate((c) => ({ ...c, open }))}
      />
    </div>
  );
}
