// The saved view currently open (set by the view page around IssuesView), so
// the toolbar slot can offer "Update view" without IssuesView threading it.
//
// API (port of src/components/navigation/saved-view-context.tsx):
//   setSavedViewContext(() => view)        provider; call during component init, GETTER arg
//   <SavedViewProvider view={view}>        same, as a component (saved-view-provider.svelte)
//   useSavedView(): { readonly current: OpenSavedView | null }   reactive
//   canonicalJson(value)                   unchanged
// (views/view-context.svelte.ts has its own useSavedView — the saved view
// IssuesView shows, with `dirty`; the toolbar imports that one as useShownSavedView.)

import { createContext } from 'svelte';

export interface OpenSavedView {
  id: string;
  name: string;
  isOwner: boolean;
  shared: boolean;
  /** As stored — compared against the live filters/display to detect edits. */
  filters: Record<string, unknown>;
  display: Record<string, unknown>;
}

interface SavedViewRef {
  readonly current: OpenSavedView | null;
}

const NONE: SavedViewRef = { current: null };

const [getContext, setContext, hasContext] = createContext<SavedViewRef>();

export function setSavedViewContext(view: () => OpenSavedView): void {
  setContext({
    get current() {
      return view();
    },
  });
}

/** The open saved view (null outside a SavedViewProvider). Read `.current`. */
export function useSavedView(): { readonly current: OpenSavedView | null } {
  return hasContext() ? getContext() : NONE;
}

/** JSON with sorted keys — jsonb reorders object keys, so compare canonically. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}
