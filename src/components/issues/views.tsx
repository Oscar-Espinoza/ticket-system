'use client';

import type { ComponentType } from 'react';
import dynamic from 'next/dynamic';
import { Kanban, List, type LucideIcon } from 'lucide-react';

import { Skeleton } from '@/components/ui-icons';
import type { IssueGroup } from '@/lib/issue-grouping';
import type { IssuePatch, IssueRow } from '@/lib/issue-model';
import { useDisplayOptions } from './display-options';
import { IssueList } from './issue-list';
import type { IssueMutations } from './use-issue-mutations';

export interface IssueViewProps {
  /** Every group, empty ones included — each view decides what to hide. */
  groups: IssueGroup[];
  mutations: IssueMutations;
  selectedId: string | null;
  onSelect?: (issue: IssueRow) => void;
  /** Open "New issue" pre-filled with a group's patch (null = project defaults). */
  onCreate: (patch: IssuePatch | null) => void;
}

export interface IssueViewDefinition {
  id: string;
  label: string;
  icon: LucideIcon;
  component: ComponentType<IssueViewProps>;
}

function ListView({ groups, mutations, selectedId, onSelect, onCreate }: IssueViewProps) {
  const [{ showEmptyGroups }] = useDisplayOptions();
  return (
    <IssueList
      groups={showEmptyGroups ? groups : groups.filter((g) => g.issues.length > 0)}
      mutations={mutations}
      selectedId={selectedId}
      onSelect={onSelect}
      onCreate={onCreate}
    />
  );
}

const loadBoard = () => import('@/components/board/board');

export function preloadViews() {
  void loadBoard();
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

// View registry: the switcher renders one entry per definition; later views
// (table, calendar — B5) register by appending here.
export const ISSUE_VIEWS: IssueViewDefinition[] = [
  { id: 'list', label: 'List', icon: List, component: ListView },
  { id: 'board', label: 'Board', icon: Kanban, component: BoardView },
];
