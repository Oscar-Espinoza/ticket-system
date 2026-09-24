'use client';

import type { ComponentType } from 'react';
import dynamic from 'next/dynamic';
import { Kanban, List, type LucideIcon } from 'lucide-react';

import { Skeleton } from '@/components/ui-icons';

import type { IssueGroup, IssueRow, TicketStatus } from '@/lib/issue-model';
import { IssueList } from './issue-list';
import type { IssueMutations } from './use-issue-mutations';

export interface IssueViewProps {
  groups: IssueGroup[];
  mutations: IssueMutations;
  selectedId: string | null;
  onSelect?: (issue: IssueRow) => void;
  onCreate: (status: TicketStatus) => void;
}

export interface IssueViewDefinition {
  id: string;
  label: string;
  icon: LucideIcon;
  component: ComponentType<IssueViewProps>;
}

function ListView({ groups, mutations, selectedId, onSelect }: IssueViewProps) {
  return (
    <IssueList
      groups={groups}
      mutations={mutations}
      selectedId={selectedId}
      onSelect={onSelect}
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
// register by appending here.
export const ISSUE_VIEWS: IssueViewDefinition[] = [
  { id: 'list', label: 'List', icon: List, component: ListView },
  { id: 'board', label: 'Board', icon: Kanban, component: BoardView },
];
