'use client';

// The saved view currently open (set by the view page around IssuesView), so
// the toolbar slot can offer "Update view" without IssuesView threading it.

import { createContext, use, type ReactNode } from 'react';

export interface OpenSavedView {
  id: string;
  name: string;
  isOwner: boolean;
  shared: boolean;
  /** As stored — compared against the live filters/display to detect edits. */
  filters: Record<string, unknown>;
  display: Record<string, unknown>;
}

const SavedViewContext = createContext<OpenSavedView | null>(null);

export function SavedViewProvider({
  view,
  children,
}: {
  view: OpenSavedView;
  children: ReactNode;
}) {
  return <SavedViewContext value={view}>{children}</SavedViewContext>;
}

export function useSavedView(): OpenSavedView | null {
  return use(SavedViewContext);
}

/** JSON with sorted keys — jsonb reorders object keys, so compare canonically. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}
