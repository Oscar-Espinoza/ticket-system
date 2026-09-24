'use client';

// How issue views are grouped, ordered and which properties they show. Plain
// per-mount state for now; B5 adds persistence (saved views / localStorage),
// the Display menu and the orderings beyond newest-first.

import { createContext, use, useState, type ReactNode } from 'react';

import type { GroupBy } from '@/lib/issue-grouping';

export type OrderBy = 'manual' | 'priority' | 'created' | 'updated' | 'dueDate' | 'title';

export type DisplayProperty =
  | 'id'
  | 'status'
  | 'priority'
  | 'assignee'
  | 'labels'
  | 'estimate'
  | 'dueDate'
  | 'created'
  | 'updated'
  | 'cycle'
  | 'epic'
  | 'milestone'
  | 'subIssues'
  | 'pullRequests';

export interface DisplayOptions {
  groupBy: GroupBy;
  subGroupBy: GroupBy | null;
  orderBy: OrderBy;
  showEmptyGroups: boolean;
  showSubIssues: boolean;
  properties: Record<DisplayProperty, boolean>;
}

export const DEFAULT_DISPLAY_OPTIONS: DisplayOptions = {
  groupBy: 'state',
  subGroupBy: null,
  orderBy: 'created',
  showEmptyGroups: false,
  showSubIssues: true,
  properties: {
    id: true,
    status: true,
    priority: true,
    assignee: true,
    labels: true,
    estimate: true,
    dueDate: true,
    created: true,
    updated: false,
    cycle: false,
    epic: false,
    milestone: false,
    subIssues: true,
    pullRequests: true,
  },
};

type DisplayOptionsState = [DisplayOptions, (next: DisplayOptions) => void];

const DisplayOptionsContext = createContext<DisplayOptionsState | null>(null);

export function DisplayOptionsProvider({
  initial = DEFAULT_DISPLAY_OPTIONS,
  children,
}: {
  initial?: DisplayOptions;
  children: ReactNode;
}) {
  const state = useState(initial);
  return <DisplayOptionsContext value={state}>{children}</DisplayOptionsContext>;
}

const FALLBACK: DisplayOptionsState = [DEFAULT_DISPLAY_OPTIONS, () => {}];

/** Defaults (read-only) outside a provider, so shared rows render anywhere. */
export function useDisplayOptions(): DisplayOptionsState {
  return use(DisplayOptionsContext) ?? FALLBACK;
}
