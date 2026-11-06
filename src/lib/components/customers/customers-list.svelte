<!--
  Customers table: search, status / tier filters and sort kept in the URL
  (`?status=&tier=&sort=&dir=`), j/k between rows (Enter follows the focused
  link), a right-click menu per row, and the create / edit / delete dialogs.
-->
<script lang="ts">
  import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
  import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
  import Building2Icon from '@lucide/svelte/icons/building-2';
  import CheckIcon from '@lucide/svelte/icons/check';
  import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import SearchIcon from '@lucide/svelte/icons/search';
  import SearchXIcon from '@lucide/svelte/icons/search-x';

  import {
    CUSTOMER_STATUSES,
    CUSTOMER_STATUS_LABEL,
    isCustomerStatus,
    type CustomerListRow,
    type CustomerStatus,
  } from '@/lib/customer-model';
  import { useProjectData, useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { Input } from '@/lib/components/ui/input';
  import { ToggleGroup, ToggleGroupItem } from '@/lib/components/ui/toggle-group';
  import { EmptyState } from '@/lib/components/ui-icons';
  import { registerHotkeys } from '@/lib/svelte/hotkeys.svelte';
  import { registerPaletteCommands } from '@/lib/svelte/palette-commands.svelte';
  import { setSearchParams, useSearchParams } from '@/lib/svelte/search-params.svelte';
  import { cn } from '@/lib/utils';
  import CustomerDialog from './customer-dialog.svelte';
  import CustomerListItem from './customer-list-item.svelte';
  import DeleteCustomerDialog from './delete-customer-dialog.svelte';

  let { customers, tiers }: { customers: CustomerListRow[]; tiers: string[] } = $props();

  const SORTS = ['name', 'status', 'tier', 'revenue', 'size', 'requests', 'open'] as const;
  type SortKey = (typeof SORTS)[number];
  type Dir = 'asc' | 'desc';
  const isSortKey = (value: string | null): value is SortKey => SORTS.includes(value as SortKey);
  /** Numbers read best biggest-first; text A→Z. */
  const DEFAULT_DIR: Record<SortKey, Dir> = {
    name: 'asc',
    status: 'asc',
    tier: 'asc',
    revenue: 'desc',
    size: 'desc',
    requests: 'desc',
    open: 'desc',
  };
  const STATUS_ORDER: Record<CustomerStatus, number> = { active: 0, lead: 1, churned: 2 };

  function compare(a: CustomerListRow, b: CustomerListRow, key: SortKey): number {
    const nullsLast = (x: number | null, y: number | null) =>
      x === y ? 0 : x === null ? 1 : y === null ? -1 : x - y;
    switch (key) {
      case 'name':
        return a.name.localeCompare(b.name);
      case 'status':
        return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      case 'tier':
        return (a.tier ?? '￿').localeCompare(b.tier ?? '￿');
      case 'revenue':
        return nullsLast(a.revenue, b.revenue);
      case 'size':
        return nullsLast(a.size, b.size);
      case 'requests':
        return a.requestCount - b.requestCount;
      case 'open':
        return a.openIssueCount - b.openIssueCount;
    }
  }

  const data = useProjectData();
  const canWrite = useProjectPermission('write');
  const isAdmin = useProjectPermission('admin');
  const searchParams = useSearchParams();

  const status = $derived.by((): CustomerStatus | 'all' => {
    const value = searchParams.get('status');
    return isCustomerStatus(value) ? value : 'all';
  });
  const tier = $derived.by(() => {
    const value = searchParams.get('tier');
    return value && tiers.includes(value) ? value : null;
  });
  const sort = $derived.by((): SortKey => {
    const value = searchParams.get('sort');
    return isSortKey(value) ? value : 'revenue';
  });
  const dir = $derived.by((): Dir => {
    const value = searchParams.get('dir');
    return value === 'asc' || value === 'desc' ? value : DEFAULT_DIR[sort];
  });

  let query = $state('');
  let creating = $state(false);
  let editing = $state<CustomerListRow | null>(null);
  let deleting = $state<CustomerListRow | null>(null);

  $effect(() => {
    if (!canWrite.current) return;
    return registerPaletteCommands([
      {
        id: 'new-customer',
        label: 'New customer',
        section: 'Customers',
        keywords: ['create', 'company', 'account'],
        run: () => (creating = true),
      },
    ]);
  });

  // j / k walk the rows; the focused row is a link, so Enter opens it natively.
  $effect(() => {
    const move = (delta: number) => {
      const rows = [...document.querySelectorAll<HTMLElement>('[data-customer-row]')];
      if (rows.length === 0) return;
      const index = rows.findIndex((row) => row === document.activeElement);
      const next = index === -1 ? (delta > 0 ? 0 : rows.length - 1) : index + delta;
      rows[Math.max(0, Math.min(rows.length - 1, next))]?.focus();
    };
    return registerHotkeys([
      { key: 'j', description: 'Next customer', scope: 'Customers', handler: () => move(1) },
      { key: 'k', description: 'Previous customer', scope: 'Customers', handler: () => move(-1) },
    ]);
  });

  const counts = $derived.by(() => {
    const byStatus: Record<CustomerStatus | 'all', number> = {
      all: customers.length,
      active: 0,
      lead: 0,
      churned: 0,
    };
    for (const c of customers) byStatus[c.status]++;
    return byStatus;
  });

  const shown = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const rows = customers.filter(
      (c) =>
        (status === 'all' || c.status === status) &&
        (!tier || c.tier === tier) &&
        (!q ||
          c.name.toLowerCase().includes(q) ||
          c.domains.some((d) => d.includes(q)) ||
          c.tier?.toLowerCase().includes(q) ||
          c.owner?.name.toLowerCase().includes(q)),
    );
    const sign = dir === 'asc' ? 1 : -1;
    return rows.sort((a, b) => sign * compare(a, b, sort) || a.name.localeCompare(b.name));
  });

  function toggleSort(key: SortKey) {
    const nextDir = key === sort ? (dir === 'asc' ? 'desc' : 'asc') : DEFAULT_DIR[key];
    setSearchParams({
      sort: key === 'revenue' ? null : key,
      dir: nextDir === DEFAULT_DIR[key] ? null : nextDir,
    });
  }

  function clearFilters() {
    query = '';
    setSearchParams({ status: null, tier: null });
  }

  const STATUS_OPTIONS = ['all', ...CUSTOMER_STATUSES] as const;
</script>

{#snippet header(key: SortKey, label: string, className?: string, alignEnd = false)}
  <button
    type="button"
    onclick={() => toggleSort(key)}
    aria-label="Sort by {label}"
    class={cn(
      'flex items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
      alignEnd && 'justify-end',
      sort === key && 'text-foreground',
      className,
    )}
  >
    {label}
    {#if sort === key}
      {#if dir === 'asc'}<ArrowUpIcon class="size-3" />{:else}<ArrowDownIcon class="size-3" />{/if}
    {/if}
  </button>
{/snippet}

<div class="flex min-h-0 flex-1 flex-col">
  <div class="mb-3 flex flex-wrap items-center gap-2">
    <div class="relative w-full sm:w-56">
      <SearchIcon
        aria-hidden="true"
        class="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        bind:value={query}
        onkeydown={(e) => {
          if (e.key === 'Escape') {
            query = '';
            e.currentTarget.blur();
          }
        }}
        placeholder="Search customers…"
        aria-label="Search customers"
        class="h-7 pl-7 text-sm"
      />
    </div>
    <ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      spacing={0}
      bind:value={() => status, (value) => {
        if (value) setSearchParams({ status: value === 'all' ? null : value });
      }}
      aria-label="Filter customers by status"
    >
      {#each STATUS_OPTIONS as s (s)}
        <ToggleGroupItem value={s} class="gap-1.5 px-2.5 text-xs">
          {s === 'all' ? 'All' : CUSTOMER_STATUS_LABEL[s]}
          <span class="text-muted-foreground tabular-nums">{counts[s]}</span>
        </ToggleGroupItem>
      {/each}
    </ToggleGroup>
    {#if tiers.length > 0}
      <DropdownMenu>
        <DropdownMenuTrigger>
          {#snippet child({ props })}
            <Button {...props} variant="outline" size="sm" class="font-normal">
              {#if tier}<span>Tier: {tier}</span>{:else}<span class="text-muted-foreground">Tier</span>{/if}
              <ChevronDownIcon class="text-muted-foreground" />
            </Button>
          {/snippet}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" class="w-44">
          <DropdownMenuItem onSelect={() => setSearchParams({ tier: null })}>
            <CheckIcon class={cn(tier && 'invisible')} />
            All tiers
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {#each tiers as t (t)}
            <DropdownMenuItem onSelect={() => setSearchParams({ tier: t })}>
              <CheckIcon class={cn(t !== tier && 'invisible')} />
              <span class="truncate">{t}</span>
            </DropdownMenuItem>
          {/each}
        </DropdownMenuContent>
      </DropdownMenu>
    {/if}
    {#if canWrite.current}
      <Button size="sm" class="ml-auto" onclick={() => (creating = true)}>
        <PlusIcon />
        New customer
      </Button>
    {/if}
  </div>

  {#if customers.length === 0}
    <EmptyState
      title="No customers yet"
      description="Track the companies you build for — revenue, owner, and which issues they asked for. Intake requests from their email domains link up automatically."
      action={canWrite.current ? newCustomerAction : undefined}
    >
      {#snippet icon()}<Building2Icon />{/snippet}
    </EmptyState>
  {:else if shown.length === 0}
    <EmptyState title="No matching customers" description="Try a different search or clear the filters.">
      {#snippet icon()}<SearchXIcon />{/snippet}
      {#snippet action()}
        <Button size="sm" variant="outline" onclick={clearFilters}>Clear filters</Button>
      {/snippet}
    </EmptyState>
  {:else}
    <div role="table" aria-label="Customers" class="flex flex-col border-t border-border">
      <div
        role="row"
        class="flex items-center gap-3 border-b border-border px-3 py-1.5 text-xs text-muted-foreground"
      >
        <span role="columnheader" class="flex-1">
          {@render header('name', 'Name')}
        </span>
        <span role="columnheader" class="hidden w-20 md:block">
          {@render header('status', 'Status')}
        </span>
        <span role="columnheader" class="hidden w-24 lg:block">
          {@render header('tier', 'Tier')}
        </span>
        <span role="columnheader" class="w-20">
          {@render header('revenue', 'Revenue', 'ml-auto', true)}
        </span>
        <span role="columnheader" class="hidden w-16 lg:block">
          {@render header('size', 'Size', 'ml-auto', true)}
        </span>
        <span role="columnheader" class="hidden w-6 md:block">
          <span class="sr-only">Owner</span>
        </span>
        <span role="columnheader" class="hidden w-18 sm:block">
          {@render header('requests', 'Requests', 'ml-auto', true)}
        </span>
        <span role="columnheader" class="w-12">
          {@render header('open', 'Open', 'ml-auto', true)}
        </span>
      </div>
      {#each shown as customer (customer.id)}
        <CustomerListItem
          {customer}
          projectId={data.project.id}
          canWrite={canWrite.current}
          isAdmin={isAdmin.current}
          onEdit={() => (editing = customer)}
          onDelete={() => (deleting = customer)}
        />
      {/each}
    </div>
  {/if}

  {#if canWrite.current}
    <CustomerDialog open={creating} onOpenChange={(open) => (creating = open)} {tiers} openAfterCreate />
    <CustomerDialog
      open={editing !== null}
      onOpenChange={(open) => {
        if (!open) editing = null;
      }}
      customer={editing ?? undefined}
      {tiers}
    />
  {/if}
  {#if isAdmin.current}
    <DeleteCustomerDialog
      customer={deleting}
      onOpenChange={(open) => {
        if (!open) deleting = null;
      }}
    />
  {/if}
</div>

{#snippet newCustomerAction()}
  <Button size="sm" onclick={() => (creating = true)}>
    <PlusIcon />
    New customer
  </Button>
{/snippet}
