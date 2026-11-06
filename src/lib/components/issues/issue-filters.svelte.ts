// Filter state for an issues view: seeded from the URL (else a saved view's
// filters), mirrored back to the URL on every change so links are shareable.
// The quick filter box accepts query syntax (label:bug assignee:me …): the
// matcher understands it as text, and Enter turns what it can into chips.
//
// API (the toolbar
// component IssueFilters is issue-filters.svelte next to this file):
//   setIssueFiltersContext(() => initial)    provider (IssueFiltersProvider); call during
//                                            component init, GETTER for the saved view's filters
//   <IssueFiltersProvider initial={…}>       same, as a component
//   useIssueFilters(): { readonly current: IssueFilters }  reactive; parsed from the URL
//                                            outside a provider
//   useSetIssueFilters(): (next) => void
//   setIssueFilters(next), applyFilters (deprecated alias), clearFilters()
//   setSearchParams(changes)                 re-export of '@/lib/svelte/search-params.svelte'
//
// IMPORT THIS MODULE WITH ITS EXTENSION — '@/lib/components/issues/issue-filters.svelte.ts' —
// because '…/issue-filters.svelte' is the IssueFilters component.
//
// URL writes go through setSearchParams (see search-params.svelte.ts: a
// history replace, not a navigation), so `page.url` does not see them; read
// params through useSearchParams() / currentUrl() from that module.

import { createContext, untrack } from 'svelte';

import { setSearchParams, useSearchParams } from '@/lib/svelte/search-params.svelte';
import {
  EMPTY_FILTERS,
  FILTER_PARAM_NAMES,
  filtersFromSearchParams,
  filtersKey,
  filtersToSearchParams,
  normalizeIssueFilters,
  type IssueFilters as Filters,
} from '@/lib/issue-filtering';

export { setSearchParams };

interface FiltersState {
  readonly current: Filters;
  set: (next: Filters) => void;
}

const [getContext, setContext, hasContext] = createContext<FiltersState>();

// The mounted provider's setter, for the module-level setIssueFilters().
let activeSetter: ((next: Filters) => void) | null = null;

function urlFiltersKey(params: { get(name: string): string | null }): string {
  return FILTER_PARAM_NAMES.some((name) => params.get(name)) ? filtersKey(filtersFromSearchParams(params)) : '';
}

/**
 * IssueFiltersProvider. `initial` = the saved view's filters, used when the URL
 * carries none (and when navigation clears the URL's filters).
 */
export function setIssueFiltersContext(initial: () => Filters | undefined): FiltersState {
  const searchParams = useSearchParams();
  const fallback = () => initial() ?? EMPTY_FILTERS;
  const urlKey = $derived(urlFiltersKey(searchParams));

  let filters = $state.raw<Filters>(
    untrack(() => (urlKey ? filtersFromSearchParams(searchParams) : fallback())),
  );

  // Someone navigated to other filters (link, back/forward) without remounting
  // us: adopt them. Our own URL writes already match `filters`.
  let seenKey = untrack(() => urlKey);
  $effect.pre(() => {
    const key = urlKey;
    if (key === seenKey) return;
    seenKey = key;
    untrack(() => {
      if (key !== filtersKey(filters)) filters = key ? filtersFromSearchParams(searchParams) : fallback();
    });
  });

  const set = (next: Filters) => {
    const normalized = normalizeIssueFilters(next);
    filters = normalized;
    setSearchParams(filtersToSearchParams(normalized));
  };

  $effect(() => {
    activeSetter = set;
    return () => {
      if (activeSetter === set) activeSetter = null;
    };
  });

  return setContext({
    get current() {
      return filters;
    },
    set,
  });
}

/** Current filters of the surrounding issues view (else parsed from the URL). Read `.current`. */
export function useIssueFilters(): { readonly current: Filters } {
  if (hasContext()) return getContext();
  const searchParams = useSearchParams();
  const parsed = $derived(filtersFromSearchParams(searchParams));
  return {
    get current() {
      return parsed;
    },
  };
}

export function useSetIssueFilters(): (next: Filters) => void {
  return hasContext() ? getContext().set : setIssueFilters;
}

/** Replace the filters of the mounted issues view (URL only when none is mounted). */
export function setIssueFilters(next: Filters) {
  if (activeSetter) activeSetter(next);
  else setSearchParams(filtersToSearchParams(normalizeIssueFilters(next)));
}

/** @deprecated use setIssueFilters. */
export const applyFilters = setIssueFilters;

export function clearFilters() {
  setIssueFilters({ ...EMPTY_FILTERS });
}
