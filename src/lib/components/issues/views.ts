// View registry: the switcher and the Display menu render one entry each, and
// IssuesView renders the current one through issue-view-host.svelte.
//
// Port of src/components/issues/views.tsx. Same exports: IssueViewProps,
// IssueViewDefinition, ISSUE_VIEWS, preloadViews. React's `component` field
// becomes either `component` (rendered directly: the list) or `lazy` (the
// next/dynamic views: loaded on demand with a skeleton while loading;
// `ssr: true` views are awaited and server-rendered, `ssr: false` views
// render only the skeleton on the server — see issue-view-host.svelte).
//   import { ISSUE_VIEWS, type IssueViewProps } from '@/lib/components/issues/views';

import type { Component } from 'svelte';
import type { LucideIcon } from '@lucide/svelte';
import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
import GanttChartIcon from '@lucide/svelte/icons/chart-no-axes-gantt';
import KanbanIcon from '@lucide/svelte/icons/kanban';
import ListIcon from '@lucide/svelte/icons/list';
import SheetIcon from '@lucide/svelte/icons/sheet';

import type { IssueGroup } from '@/lib/issue-grouping';
import type { IssuePatch, IssueRow } from '@/lib/issue-model';
import type { ViewLayout } from './display-options.svelte';
import ListView from './list-view.svelte';
import type { IssueMutations } from './use-issue-mutations.svelte';

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

export type IssueViewModule = { default: Component<IssueViewProps> };

export interface LazyIssueView {
  load: () => Promise<IssueViewModule>;
  /** True = the server awaits the chunk and renders the view (next/dynamic
   *  default); false = client only (the server and first paint show `loading`). */
  ssr: boolean;
  /** Skeleton shown while the code loads. */
  loading: 'board' | 'rows' | 'card';
}

export interface IssueViewDefinition {
  id: ViewLayout;
  label: string;
  icon: LucideIcon;
  /** Rendered directly (bundled with the page). */
  component?: Component<IssueViewProps>;
  /** Code-split view (next/dynamic in React). */
  lazy?: LazyIssueView;
}

const loadBoard = () => import('@/lib/components/board/board.svelte') as Promise<IssueViewModule>;
const loadTable = () => import('@/lib/components/views/table-view.svelte') as Promise<IssueViewModule>;
const loadCalendar = () => import('@/lib/components/views/calendar-view.svelte') as Promise<IssueViewModule>;
const loadTimeline = () => import('@/lib/components/views/timeline-view.svelte') as Promise<IssueViewModule>;

export function preloadViews() {
  void loadBoard();
  void loadTable();
  void loadCalendar();
  void loadTimeline();
}

export const ISSUE_VIEWS: IssueViewDefinition[] = [
  { id: 'list', label: 'List', icon: ListIcon, component: ListView },
  { id: 'board', label: 'Board', icon: KanbanIcon, lazy: { load: loadBoard, ssr: true, loading: 'board' } },
  { id: 'table', label: 'Table', icon: SheetIcon, lazy: { load: loadTable, ssr: true, loading: 'rows' } },
  // Client only: "today" and the visible month depend on the viewer's timezone.
  {
    id: 'calendar',
    label: 'Calendar',
    icon: CalendarDaysIcon,
    lazy: { load: loadCalendar, ssr: false, loading: 'card' },
  },
  // Client only too: "today", the zoom (localStorage) and scroll position.
  {
    id: 'timeline',
    label: 'Timeline',
    icon: GanttChartIcon,
    lazy: { load: loadTimeline, ssr: false, loading: 'card' },
  },
];
