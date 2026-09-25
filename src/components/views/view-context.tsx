'use client';

// Per-IssuesView facts that rows, cards and the toolbar slot read without prop
// drilling: sub-issue progress per parent and the saved view being shown.

import { createContext, use, type ReactNode } from 'react';

export interface SubIssueCount {
  total: number;
  /** Completed or canceled. */
  done: number;
}

export interface SavedViewInfo {
  id: string;
  name: string;
  /** Current filters / display differ from what the view saved. */
  dirty: boolean;
}

interface IssuesViewContextValue {
  subIssues: ReadonlyMap<string, SubIssueCount>;
  savedView: SavedViewInfo | null;
}

const EMPTY: IssuesViewContextValue = { subIssues: new Map(), savedView: null };

const IssuesViewContext = createContext<IssuesViewContextValue>(EMPTY);

export function IssuesViewContextProvider({
  value,
  children,
}: {
  value: IssuesViewContextValue;
  children: ReactNode;
}) {
  return <IssuesViewContext value={value}>{children}</IssuesViewContext>;
}

/** Sub-issues of `issueId` among the view's issues (null = none). */
export function useSubIssueCount(issueId: string): SubIssueCount | null {
  return use(IssuesViewContext).subIssues.get(issueId) ?? null;
}

/** The saved view IssuesView is showing (null on plain issue lists). */
export function useSavedView(): SavedViewInfo | null {
  return use(IssuesViewContext).savedView;
}
