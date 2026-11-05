<!--
  Toolbar: Filter button (`f`), active filter chips, quick text box, Clear.
  (Component half of src/components/issues/issue-filters.tsx; the filter state
  and provider live in issue-filters.svelte.ts.)
-->
<script lang="ts">
  import type { ComponentProps } from 'svelte';
  import SearchIcon from '@lucide/svelte/icons/search';
  import XIcon from '@lucide/svelte/icons/x';

  import { useOptionalProjectData, type ProjectData } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import FilterMenu from '@/lib/components/views/filter-menu.svelte';
  import FilterChips from '@/lib/components/views/filter-chips.svelte';
  import SearchSyntaxHelp from '@/lib/components/views/search-syntax-help.svelte';
  import { registerHotkeys } from '@/lib/svelte/hotkeys.svelte';
  import { cn } from '@/lib/utils';
  import {
    EMPTY_FILTERS,
    filtersKey,
    isFilterActive,
    resolveSearchTerms,
    type IssueFilters as Filters,
    type SearchKey,
  } from '@/lib/issue-filtering';
  import { useIssueFilters, useSetIssueFilters } from './issue-filters.svelte.ts';

  type FilterPropertyId = NonNullable<ComponentProps<typeof FilterMenu>['property']>;

  const filters = useIssueFilters();
  const setFilters = useSetIssueFilters();
  const data = useOptionalProjectData();

  let menu = $state<{ open: boolean; property: FilterPropertyId | null }>({ open: false, property: null });

  $effect(() =>
    registerHotkeys([
      {
        key: 'f',
        scope: 'Issues',
        description: 'Filter issues',
        when: (event) => !event.shiftKey,
        handler: () => {
          menu = { open: true, property: null };
        },
      },
    ]),
  );

  const active = $derived(isFilterActive(filters.current));

  // ---- Quick filter ---------------------------------------------------------

  // List rows carry no cycle / epic names, so those terms always become chips.
  const ID_ONLY_KEYS: SearchKey[] = ['cycle', 'epic'];

  function resolveWith(data: ProjectData | null, filters: Filters, q: string, onlyKeys?: SearchKey[]): Filters {
    if (!data) return { ...filters, q };
    const next = resolveSearchTerms(filters, q, data, onlyKeys);
    // Nothing became a chip: keep the text exactly as typed (no reformatting under the caret).
    const unchanged = filtersKey({ ...next, q: '' }) === filtersKey({ ...filters, q: '' });
    return unchanged ? { ...filters, q } : next;
  }

  /** Appends `token` to `query` with a separating space (search-syntax-help's appendToken). */
  function appendToken(query: string, token: string): string {
    const base = query.trimEnd();
    return base ? `${base} ${token} ` : `${token} `;
  }

  const value = $derived(filters.current.q);
  let draft = $state(filters.current.q);
  let synced = filters.current.q;
  // Filters changed elsewhere (Clear, saved view): follow them.
  $effect.pre(() => {
    const q = value;
    if (q !== synced) {
      synced = q;
      draft = q;
    }
  });

  // Debounced so typing doesn't rewrite the URL per keystroke; the timer reads
  // the latest filters when it fires.
  function commit(q: string, all = false) {
    setFilters(resolveWith(data, filters.current, q, all ? undefined : ID_ONLY_KEYS));
  }
  $effect(() => {
    if (draft === value) return;
    const q = draft;
    const id = setTimeout(() => commit(q), 200);
    return () => clearTimeout(id);
  });

  const syntax = $derived(/(^|\s)-?[a-z]+:/i.test(draft));

  function onkeydown(event: KeyboardEvent & { currentTarget: EventTarget & HTMLInputElement }) {
    if (event.key === 'Escape') {
      draft = '';
      event.currentTarget.blur();
    } else if (event.key === 'Enter') {
      // Enter: convert every term that maps onto a filter into a chip.
      event.preventDefault();
      const next = resolveWith(data, filters.current, draft);
      draft = next.q;
      synced = next.q;
      setFilters(next);
    }
  }
</script>

<div class="flex min-w-0 flex-wrap items-center gap-1.5">
  <FilterMenu
    filters={filters.current}
    onChange={setFilters}
    open={menu.open}
    property={menu.property}
    onOpenChange={(open: boolean) => (menu = { open, property: open ? menu.property : null })}
    onPropertyChange={(property: FilterPropertyId | null) => (menu = { ...menu, property })}
  />
  <FilterChips
    filters={filters.current}
    onChange={setFilters}
    onEdit={(property: FilterPropertyId) => (menu = { open: true, property })}
  />
  <div class="flex items-center">
    <label class="relative flex items-center">
      <SearchIcon class="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" aria-hidden="true" />
      <input
        type="search"
        bind:value={draft}
        {onkeydown}
        placeholder="Filter… (label:bug)"
        aria-label="Filter issues by title, ID or query (label:bug, assignee:me)"
        title={syntax ? 'Press Enter to turn filters into chips' : undefined}
        class={cn(
          'h-7 w-44 rounded-md border border-transparent bg-transparent pr-2 pl-7 text-xs outline-none transition-[width] placeholder:text-muted-foreground hover:border-border focus-visible:w-64 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 [&::-webkit-search-cancel-button]:hidden',
          syntax && 'w-64 font-mono',
        )}
      />
    </label>
    <SearchSyntaxHelp
      note="Free text matches titles and IDs."
      onInsert={(token: string) => (draft = appendToken(draft, token))}
    />
  </div>
  {#if active}
    <Button
      variant="ghost"
      size="sm"
      onclick={() => setFilters({ ...EMPTY_FILTERS })}
      class="text-muted-foreground"
    >
      <XIcon />
      Clear
    </Button>
  {/if}
</div>
