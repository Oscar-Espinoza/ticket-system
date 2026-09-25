'use client';

// Filter state for an issues view: seeded from the URL (else a saved view's
// filters), mirrored back to the URL on every change so links are shareable.
// The quick filter box accepts query syntax (label:bug assignee:me …): the
// matcher understands it as text, and Enter turns what it can into chips.

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';

import { useOptionalProjectData, type ProjectData } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import { FilterChips, FilterMenu, type FilterPropertyId } from '@/components/views/filter-menu';
import { SearchSyntaxHelp, appendToken } from '@/components/views/search-syntax-help';
import { registerHotkeys } from '@/lib/hotkeys';
import { cn } from '@/lib/utils';
import {
  EMPTY_FILTERS,
  FILTER_PARAM_NAMES,
  filtersFromSearchParams,
  filtersKey,
  filtersToSearchParams,
  isFilterActive,
  normalizeIssueFilters,
  resolveSearchTerms,
  type IssueFilters as Filters,
  type SearchKey,
} from '@/lib/issue-filtering';

// Native history updates sync with useSearchParams without a server request —
// view, filter and pane state are all client-side.
export function setSearchParams(changes: Record<string, string | null>) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(changes)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const query = params.toString();
  window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
}

type FiltersState = [Filters, (next: Filters) => void];

const FiltersContext = createContext<FiltersState | null>(null);

// The mounted provider's setter, for the module-level setIssueFilters().
let activeSetter: ((next: Filters) => void) | null = null;

function urlFiltersKey(params: URLSearchParams | { get(name: string): string | null }): string {
  return FILTER_PARAM_NAMES.some((name) => params.get(name)) ? filtersKey(filtersFromSearchParams(params)) : '';
}

export function IssueFiltersProvider({
  initial,
  children,
}: {
  /** Saved view filters — used when the URL carries none. */
  initial?: Filters;
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const fallback = initial ?? EMPTY_FILTERS;
  const urlKey = urlFiltersKey(searchParams);
  const [filters, setFilters] = useState<Filters>(() =>
    urlKey ? filtersFromSearchParams(searchParams) : fallback,
  );

  // Someone navigated to other filters (link, back/forward) without remounting
  // us: adopt them. Our own replaceState writes already match `filters`.
  const [seenKey, setSeenKey] = useState(urlKey);
  if (urlKey !== seenKey) {
    setSeenKey(urlKey);
    if (urlKey !== filtersKey(filters)) setFilters(urlKey ? filtersFromSearchParams(searchParams) : fallback);
  }

  const set = useCallback((next: Filters) => {
    const normalized = normalizeIssueFilters(next);
    setFilters(normalized);
    setSearchParams(filtersToSearchParams(normalized));
  }, []);

  useEffect(() => {
    activeSetter = set;
    return () => {
      if (activeSetter === set) activeSetter = null;
    };
  }, [set]);

  const state = useMemo<FiltersState>(() => [filters, set], [filters, set]);
  return <FiltersContext value={state}>{children}</FiltersContext>;
}

/** Current filters of the surrounding issues view (else parsed from the URL). */
export function useIssueFilters(): Filters {
  const context = use(FiltersContext);
  const searchParams = useSearchParams();
  return useMemo(
    () => context?.[0] ?? filtersFromSearchParams(searchParams),
    [context, searchParams],
  );
}

export function useSetIssueFilters(): (next: Filters) => void {
  return use(FiltersContext)?.[1] ?? setIssueFilters;
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

// List rows carry no cycle / epic names, so those terms always become chips.
const ID_ONLY_KEYS: SearchKey[] = ['cycle', 'epic'];

function resolveWith(data: ProjectData | null, filters: Filters, q: string, onlyKeys?: SearchKey[]): Filters {
  if (!data) return { ...filters, q };
  const next = resolveSearchTerms(filters, q, data, onlyKeys);
  // Nothing became a chip: keep the text exactly as typed (no reformatting under the caret).
  const unchanged = filtersKey({ ...next, q: '' }) === filtersKey({ ...filters, q: '' });
  return unchanged ? { ...filters, q } : next;
}

function QuickFilter({ filters, onChange }: { filters: Filters; onChange: (next: Filters) => void }) {
  const data = useOptionalProjectData();
  const value = filters.q;
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  // Filters changed elsewhere (Clear, saved view): follow them.
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  // Debounced so typing doesn't rewrite the URL per keystroke; the event reads
  // the latest filters when it fires.
  const commit = useEffectEvent((q: string, all = false) =>
    onChange(resolveWith(data, filters, q, all ? undefined : ID_ONLY_KEYS)),
  );
  useEffect(() => {
    if (draft === value) return;
    const id = setTimeout(() => commit(draft), 200);
    return () => clearTimeout(id);
  }, [draft, value]);
  const update = setDraft;
  const syntax = /(^|\s)-?[a-z]+:/i.test(draft);

  return (
    <div className="flex items-center">
      <label className="relative flex items-center">
        <Search className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={draft}
          onChange={(event) => update(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              update('');
              event.currentTarget.blur();
            } else if (event.key === 'Enter') {
              // Enter: convert every term that maps onto a filter into a chip.
              event.preventDefault();
              const next = resolveWith(data, filters, draft);
              setDraft(next.q);
              setSynced(next.q);
              onChange(next);
            }
          }}
          placeholder="Filter… (label:bug)"
          aria-label="Filter issues by title, ID or query (label:bug, assignee:me)"
          title={syntax ? 'Press Enter to turn filters into chips' : undefined}
          className={cn(
            'h-7 w-44 rounded-md border border-transparent bg-transparent pr-2 pl-7 text-xs outline-none transition-[width] placeholder:text-muted-foreground hover:border-border focus-visible:w-64 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 [&::-webkit-search-cancel-button]:hidden',
            syntax && 'w-64 font-mono',
          )}
        />
      </label>
      <SearchSyntaxHelp
        note="Free text matches titles and IDs."
        onInsert={(token) => update(appendToken(draft, token))}
      />
    </div>
  );
}

/** Toolbar: Filter button (`f`), active filter chips, quick text box, Clear. */
export function IssueFilters() {
  const filters = useIssueFilters();
  const setFilters = useSetIssueFilters();
  const [menu, setMenu] = useState<{ open: boolean; property: FilterPropertyId | null }>({
    open: false,
    property: null,
  });

  const openMenu = useEffectEvent(() => setMenu({ open: true, property: null }));
  useEffect(
    () =>
      registerHotkeys([
        {
          key: 'f',
          scope: 'Issues',
          description: 'Filter issues',
          when: (event) => !event.shiftKey,
          handler: () => openMenu(),
        },
      ]),
    [],
  );

  const active = isFilterActive(filters);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <FilterMenu
        filters={filters}
        onChange={setFilters}
        open={menu.open}
        property={menu.property}
        onOpenChange={(open) => setMenu((m) => ({ open, property: open ? m.property : null }))}
        onPropertyChange={(property) => setMenu((m) => ({ ...m, property }))}
      />
      <FilterChips
        filters={filters}
        onChange={setFilters}
        onEdit={(property) => setMenu({ open: true, property })}
      />
      <QuickFilter filters={filters} onChange={setFilters} />
      {active && (
        <Button variant="ghost" size="sm" onClick={() => setFilters({ ...EMPTY_FILTERS })} className="text-muted-foreground">
          <X />
          Clear
        </Button>
      )}
    </div>
  );
}
