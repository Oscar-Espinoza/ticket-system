'use client';

import type { ComponentType } from 'react';
import { List, type LucideIcon } from 'lucide-react';

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

// View registry: the switcher renders one entry per definition; later views
// register by appending here.
export const ISSUE_VIEWS: IssueViewDefinition[] = [
  { id: 'list', label: 'List', icon: List, component: ListView },
];
