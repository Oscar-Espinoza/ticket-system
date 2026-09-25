'use client';

import type { ComponentType } from 'react';
import dynamic from 'next/dynamic';
import { CalendarDays, Kanban, List, Sheet, type LucideIcon } from 'lucide-react';

import { useProjectData } from '@/components/project/project-data';
import { Skeleton } from '@/components/ui-icons';
import { subGroupIssues, type IssueGroup } from '@/lib/issue-grouping';
import type { IssuePatch, IssueRow } from '@/lib/issue-model';
import { useDisplayOptions, type ViewLayout } from './display-options';
import { IssueList } from './issue-list';
import type { IssueMutations } from './use-issue-mutations';

export interface IssueViewProps {
  /** Every group, empty ones included — each view decides what to hide. */
  groups: IssueGroup[];
  /** The same issues flat (filtered, ordered, no duplicates) — table / calendar. */
  issues: IssueRow[];
  mutations: IssueMutations;
  selectedId: string | null;
  onSelect?: (issue: IssueRow) => void;
  /** Open "New issue" pre-filled with a group's patch (null = project defaults). */
  onCreate: (patch: IssuePatch | null) => void;
}

export interface IssueViewDefinition {
  id: ViewLayout;
  label: string;
  icon: LucideIcon;
  component: ComponentType<IssueViewProps>;
}

function ListView({ groups, mutations, selectedId, onSelect, onCreate }: IssueViewProps) {
  const [{ showEmptyGroups, subGroupBy }] = useDisplayOptions();
  const data = useProjectData();
  const visible = showEmptyGroups ? groups : groups.filter((g) => g.issues.length > 0);
  return (
    <IssueList
      groups={subGroupIssues(visible, subGroupBy, data)}
      mutations={mutations}
      selectedId={selectedId}
      onSelect={onSelect}
      onCreate={onCreate}
    />
  );
}

const loadBoard = () => import('@/components/board/board');
const loadTable = () => import('@/components/views/table-view');
const loadCalendar = () => import('@/components/views/calendar-view');

export function preloadViews() {
  void loadBoard();
  void loadTable();
  void loadCalendar();
}

const BoardView = dynamic(loadBoard, {
  loading: () => (
    <div className="flex gap-3">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} variant="card" className="h-64 w-[272px] shrink-0" />
      ))}
    </div>
  ),
});

const rowsSkeleton = () => (
  <div className="flex flex-col gap-1">
    {Array.from({ length: 8 }, (_, i) => (
      <Skeleton key={i} variant="row" />
    ))}
  </div>
);

const TableView = dynamic(loadTable, { loading: rowsSkeleton });

// Client only: "today" and the visible month depend on the viewer's timezone.
const CalendarView = dynamic(loadCalendar, {
  ssr: false,
  loading: () => <Skeleton variant="card" className="h-[32rem] w-full" />,
});

// View registry: the switcher and the Display menu render one entry each.
export const ISSUE_VIEWS: IssueViewDefinition[] = [
  { id: 'list', label: 'List', icon: List, component: ListView },
  { id: 'board', label: 'Board', icon: Kanban, component: BoardView },
  { id: 'table', label: 'Table', icon: Sheet, component: TableView },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays, component: CalendarView },
];
