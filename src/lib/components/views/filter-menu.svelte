<!--
  Linear-style two-level filter menu (property → values). Pure UI over
  IssueFilters — state lives in IssueFiltersProvider
  (src/lib/components/issues/issue-filters.svelte.ts).
  Port of FilterMenu in src/components/views/filter-menu.tsx (same props).
  The chips for active filters are filter-chips.svelte.
-->
<script module lang="ts">
  export type { FilterPropertyId } from './filter-properties.svelte';
</script>

<script lang="ts">
  import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
  import ListFilterIcon from '@lucide/svelte/icons/list-filter';

  import { Button } from '@/lib/components/ui/button';
  import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
  } from '@/lib/components/ui/command';
  import { Popover, PopoverContent, PopoverTrigger } from '@/lib/components/ui/popover';
  import { keywordFilter } from '@/lib/components/issue-pickers';
  import { Avatar, PriorityIcon, StateIcon, StatusIcon } from '@/lib/components/ui-icons';
  import type { IssueFilters } from '@/lib/issue-filtering';
  import { cn } from '@/lib/utils';
  import { toggleValue, useFilterProperties, type FilterPropertyId } from './filter-properties.svelte';

  let {
    filters,
    onChange,
    open,
    onOpenChange,
    property,
    onPropertyChange,
  }: {
    filters: IssueFilters;
    onChange: (next: IssueFilters) => void;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Value list being shown; null = the property list. */
    property: FilterPropertyId | null;
    onPropertyChange: (property: FilterPropertyId | null) => void;
  } = $props();

  const properties = useFilterProperties();
  const current = $derived(properties.current.find((p) => p.id === property) ?? null);
  let search = $state('');

  function go(next: FilterPropertyId | null) {
    search = '';
    onPropertyChange(next);
  }

  // Controlled like the React Popover: the parent owns `open`.
  function setOpen(next: boolean) {
    if (!next) search = '';
    onOpenChange(next);
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Backspace' && !search && current) {
      event.preventDefault();
      go(null);
    }
  }
</script>

<Popover bind:open={() => open, setOpen}>
  <PopoverTrigger>
    {#snippet child({ props })}
      <Button {...props} variant="ghost" size="sm" aria-label="Filter (F)" class="text-muted-foreground">
        <ListFilterIcon />
        Filter
      </Button>
    {/snippet}
  </PopoverTrigger>
  <PopoverContent align="start" class="w-64 gap-0 p-0">
    {#key current?.id ?? 'properties'}
      <Command filter={keywordFilter} {onkeydown}>
        <CommandInput bind:value={search} placeholder={current ? `${current.label}…` : 'Filter by…'} />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          {#if current}
            {@const selected = current.get(filters)}
            <CommandGroup>
              {#snippet heading()}
                <button
                  type="button"
                  onclick={() => go(null)}
                  class="-ml-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground"
                >
                  <ChevronLeftIcon class="size-3" aria-hidden="true" />
                  {current.label}
                </button>
              {/snippet}
              {#each current.options as option (option.value)}
                <CommandItem
                  value={option.value}
                  keywords={[option.label]}
                  data-checked={selected.includes(option.value)}
                  onSelect={() => {
                    onChange(toggleValue(current, filters, option.value));
                    if (current.single) onOpenChange(false);
                  }}
                >
                  {#if option.icon?.kind === 'avatar'}
                    <Avatar name={option.icon.name} src={option.icon.src} size={20} />
                  {:else if option.icon?.kind === 'state'}
                    <StateIcon state={option.icon.state} size={14} />
                  {:else if option.icon?.kind === 'status'}
                    <StatusIcon type={option.icon.type} size={14} />
                  {:else if option.icon?.kind === 'priority'}
                    <PriorityIcon priority={option.icon.priority} size={14} />
                  {:else if option.icon?.kind === 'lucide'}
                    <option.icon.icon class={option.icon.class} />
                  {:else if option.icon?.kind === 'dot'}
                    <span
                      aria-hidden="true"
                      class="size-2 shrink-0 rounded-full bg-muted-foreground"
                      style:background-color={option.icon.color || undefined}
                    ></span>
                  {/if}
                  <span class="truncate">{option.label}</span>
                </CommandItem>
              {/each}
            </CommandGroup>
          {:else}
            <CommandGroup>
              {#each properties.current as p (p.id)}
                {@const count = p.get(filters).length}
                <CommandItem value={p.id} keywords={[p.label]} onSelect={() => go(p.id)}>
                  <p.icon class="text-muted-foreground" />
                  <span class="truncate">{p.label}</span>
                  {#if count > 0}
                    <span class="ml-auto text-xs tabular-nums text-muted-foreground">{count}</span>
                  {/if}
                  <ChevronRightIcon class={cn('text-muted-foreground', count === 0 && 'ml-auto')} />
                </CommandItem>
              {/each}
            </CommandGroup>
          {/if}
        </CommandList>
      </Command>
    {/key}
  </PopoverContent>
</Popover>
