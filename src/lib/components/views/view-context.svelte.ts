// Per-IssuesView facts that rows, cards and the toolbar slot read without prop
// drilling: sub-issue progress per parent and the saved view being shown.
//
// API:
//   setIssuesViewContext(() => ({ subIssues, savedView }))   provider; GETTER arg
//   <IssuesViewContextProvider value={…}>                    same, as a component
//   useSubIssueCount(issueId | () => issueId): { readonly current: SubIssueCount | null }
//   useSavedView(): { readonly current: SavedViewInfo | null }
// Outside a provider both read the empty defaults.

import { createContext } from 'svelte';

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

export interface IssuesViewContextValue {
  subIssues: ReadonlyMap<string, SubIssueCount>;
  savedView: SavedViewInfo | null;
}

const EMPTY: IssuesViewContextValue = { subIssues: new Map(), savedView: null };

const [getContext, setContext, hasContext] = createContext<() => IssuesViewContextValue>();

const read = (): (() => IssuesViewContextValue) => (hasContext() ? getContext() : () => EMPTY);

export function setIssuesViewContext(value: () => IssuesViewContextValue): void {
  setContext(value);
}

/** Sub-issues of `issueId` among the view's issues (null = none). Read `.current`. */
export function useSubIssueCount(issueId: string | (() => string)): { readonly current: SubIssueCount | null } {
  const get = read();
  const id = typeof issueId === 'function' ? issueId : () => issueId;
  return {
    get current() {
      return get().subIssues.get(id()) ?? null;
    },
  };
}

/** The saved view IssuesView is showing (null on plain issue lists). Read `.current`. */
export function useSavedView(): { readonly current: SavedViewInfo | null } {
  const get = read();
  return {
    get current() {
      return get().savedView;
    },
  };
}
