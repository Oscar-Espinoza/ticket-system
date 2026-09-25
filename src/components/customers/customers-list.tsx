'use client';

// Customers table: search, status / tier filters and sort kept in the URL
// (`?status=&tier=&sort=&dir=`), j/k between rows (Enter follows the focused
// link), a right-click menu per row, and the create / edit / delete dialogs.

import { useDeferredValue, useEffect, useEffectEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  Building2,
  Check,
  ChevronDown,
  Link2,
  Pencil,
  Plus,
  Search,
  SearchX,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { useProjectData, useProjectPermission } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Avatar, EmptyState } from '@/components/ui-icons';
import { registerHotkeys } from '@/lib/hotkeys';
import { registerPaletteCommands } from '@/lib/palette-commands';
import { cn } from '@/lib/utils';
import { CustomerDialog, DeleteCustomerDialog } from './customer-dialog';
import { CustomerLogo, CustomerStatusChip } from './customer-glyphs';
import {
  CUSTOMER_STATUSES,
  CUSTOMER_STATUS_LABEL,
  customerPath,
  formatRevenue,
  formatSize,
  isCustomerStatus,
  type CustomerListRow,
  type CustomerStatus,
} from './customer-model';

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

function setParams(changes: Record<string, string | null>) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
}

export function CustomersList({
  customers,
  tiers,
}: {
  customers: CustomerListRow[];
  tiers: string[];
}) {
  const { project } = useProjectData();
  const canWrite = useProjectPermission('write');
  const isAdmin = useProjectPermission('admin');
  const searchParams = useSearchParams();
  const statusParam = searchParams.get('status');
  const status: CustomerStatus | 'all' = isCustomerStatus(statusParam) ? statusParam : 'all';
  const tierParam = searchParams.get('tier');
  const tier = tierParam && tiers.includes(tierParam) ? tierParam : null;
  const sortParam = searchParams.get('sort');
  const sort: SortKey = isSortKey(sortParam) ? sortParam : 'revenue';
  const dirParam = searchParams.get('dir');
  const dir: Dir = dirParam === 'asc' || dirParam === 'desc' ? dirParam : DEFAULT_DIR[sort];

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CustomerListRow | null>(null);
  const [deleting, setDeleting] = useState<CustomerListRow | null>(null);

  const onCreate = useEffectEvent(() => setCreating(true));
  useEffect(() => {
    if (!canWrite) return;
    return registerPaletteCommands([
      {
        id: 'new-customer',
        label: 'New customer',
        section: 'Customers',
        keywords: ['create', 'company', 'account'],
        run: () => onCreate(),
      },
    ]);
  }, [canWrite]);

  // j / k walk the rows; the focused row is a link, so Enter opens it natively.
  useEffect(() => {
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
  }, []);

  const counts = useMemo(() => {
    const byStatus: Record<CustomerStatus | 'all', number> = {
      all: customers.length,
      active: 0,
      lead: 0,
      churned: 0,
    };
    for (const c of customers) byStatus[c.status]++;
    return byStatus;
  }, [customers]);

  const shown = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
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
  }, [customers, deferredQuery, status, tier, sort, dir]);

  const toggleSort = (key: SortKey) => {
    const nextDir = key === sort ? (dir === 'asc' ? 'desc' : 'asc') : DEFAULT_DIR[key];
    setParams({
      sort: key === 'revenue' ? null : key,
      dir: nextDir === DEFAULT_DIR[key] ? null : nextDir,
    });
  };

  const clearFilters = () => {
    setQuery('');
    setParams({ status: null, tier: null });
  };

  const header = (key: SortKey, label: string, className?: string, alignEnd = false) => (
    <button
      type="button"
      onClick={() => toggleSort(key)}
      aria-label={`Sort by ${label}`}
      className={cn(
        'flex items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
        alignEnd && 'justify-end',
        sort === key && 'text-foreground',
        className,
      )}
    >
      {label}
      {sort === key &&
        (dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
    </button>
  );

  let body: React.ReactNode;
  if (customers.length === 0) {
    body = (
      <EmptyState
        icon={<Building2 />}
        title="No customers yet"
        description="Track the companies you build for — revenue, owner, and which issues they asked for. Intake requests from their email domains link up automatically."
        action={
          canWrite ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus />
              New customer
            </Button>
          ) : undefined
        }
      />
    );
  } else if (shown.length === 0) {
    body = (
      <EmptyState
        icon={<SearchX />}
        title="No matching customers"
        description="Try a different search or clear the filters."
        action={
          <Button size="sm" variant="outline" onClick={clearFilters}>
            Clear filters
          </Button>
        }
      />
    );
  } else {
    body = (
      <div role="table" aria-label="Customers" className="flex flex-col border-t border-border">
        <div
          role="row"
          className="flex items-center gap-3 border-b border-border px-3 py-1.5 text-xs text-muted-foreground"
        >
          <span role="columnheader" className="flex-1">
            {header('name', 'Name')}
          </span>
          <span role="columnheader" className="hidden w-20 md:block">
            {header('status', 'Status')}
          </span>
          <span role="columnheader" className="hidden w-24 lg:block">
            {header('tier', 'Tier')}
          </span>
          <span role="columnheader" className="w-20">
            {header('revenue', 'Revenue', 'ml-auto', true)}
          </span>
          <span role="columnheader" className="hidden w-16 lg:block">
            {header('size', 'Size', 'ml-auto', true)}
          </span>
          <span role="columnheader" className="hidden w-6 md:block">
            <span className="sr-only">Owner</span>
          </span>
          <span role="columnheader" className="hidden w-18 sm:block">
            {header('requests', 'Requests', 'ml-auto', true)}
          </span>
          <span role="columnheader" className="w-12">
            {header('open', 'Open', 'ml-auto', true)}
          </span>
        </div>
        {shown.map((customer) => (
          <CustomerListItem
            key={customer.id}
            customer={customer}
            projectId={project.id}
            canWrite={canWrite}
            isAdmin={isAdmin}
            onEdit={() => setEditing(customer)}
            onDelete={() => setDeleting(customer)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-56">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setQuery('');
                e.currentTarget.blur();
              }
            }}
            placeholder="Search customers…"
            aria-label="Search customers"
            className="h-7 pl-7 text-sm"
          />
        </div>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          spacing={0}
          value={status}
          onValueChange={(value) =>
            value && setParams({ status: value === 'all' ? null : value })
          }
          aria-label="Filter customers by status"
        >
          {(['all', ...CUSTOMER_STATUSES] as const).map((s) => (
            <ToggleGroupItem key={s} value={s} className="gap-1.5 px-2.5 text-xs">
              {s === 'all' ? 'All' : CUSTOMER_STATUS_LABEL[s]}
              <span className="text-muted-foreground tabular-nums">{counts[s]}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {tiers.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="font-normal">
                {tier ? <span>Tier: {tier}</span> : <span className="text-muted-foreground">Tier</span>}
                <ChevronDown className="text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuItem onSelect={() => setParams({ tier: null })}>
                <Check className={cn(tier && 'invisible')} />
                All tiers
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {tiers.map((t) => (
                <DropdownMenuItem key={t} onSelect={() => setParams({ tier: t })}>
                  <Check className={cn(t !== tier && 'invisible')} />
                  <span className="truncate">{t}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {canWrite && (
          <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}>
            <Plus />
            New customer
          </Button>
        )}
      </div>
      {body}
      {canWrite && (
        <>
          <CustomerDialog open={creating} onOpenChange={setCreating} tiers={tiers} openAfterCreate />
          <CustomerDialog
            open={editing !== null}
            onOpenChange={(open) => !open && setEditing(null)}
            customer={editing ?? undefined}
            tiers={tiers}
          />
        </>
      )}
      {isAdmin && (
        <DeleteCustomerDialog customer={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
      )}
    </div>
  );
}

function CustomerListItem({
  customer,
  projectId,
  canWrite,
  isAdmin,
  onEdit,
  onDelete,
}: {
  customer: CustomerListRow;
  projectId: string;
  canWrite: boolean;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const href = customerPath(projectId, customer.id);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(new URL(href, window.location.origin).toString());
      toast.success('Copied customer link');
    } catch {
      toast.error('Could not copy to the clipboard.');
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Link
          href={href}
          role="row"
          data-customer-row={customer.id}
          className={cn(
            'flex min-h-10 items-center gap-3 border-b border-border px-3 py-1.5 text-sm outline-none hover:bg-accent/50 focus-visible:bg-accent',
            customer.status === 'churned' && 'text-muted-foreground',
          )}
        >
          <span role="cell" className="flex min-w-0 flex-1 items-center gap-2">
            <CustomerLogo name={customer.name} />
            <span className="truncate font-medium">{customer.name}</span>
            {customer.domains[0] && (
              <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                {customer.domains[0]}
                {customer.domains.length > 1 ? ` +${customer.domains.length - 1}` : ''}
              </span>
            )}
          </span>
          <span role="cell" className="hidden w-20 md:block">
            <CustomerStatusChip status={customer.status} />
          </span>
          <span role="cell" className="hidden w-24 truncate text-xs text-muted-foreground lg:block">
            {customer.tier}
          </span>
          <span role="cell" className="w-20 text-right text-xs tabular-nums" title={formatRevenue(customer.revenue, true)}>
            {formatRevenue(customer.revenue)}
          </span>
          <span role="cell" className="hidden w-16 text-right text-xs text-muted-foreground tabular-nums lg:block">
            {formatSize(customer.size)}
          </span>
          <span
            role="cell"
            className="hidden w-6 md:block"
            title={customer.owner ? `Owner: ${customer.owner.name}` : 'No owner'}
          >
            {customer.owner && (
              <Avatar name={customer.owner.name} src={customer.owner.image} size={20} />
            )}
          </span>
          <span role="cell" className="hidden w-18 text-right text-xs text-muted-foreground tabular-nums sm:block">
            {customer.requestCount || ''}
          </span>
          <span role="cell" className="w-12 text-right text-xs text-muted-foreground tabular-nums">
            {customer.openIssueCount || ''}
          </span>
        </Link>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem asChild>
          <Link href={href}>Open</Link>
        </ContextMenuItem>
        <ContextMenuItem onSelect={copyLink}>
          <Link2 />
          Copy link
        </ContextMenuItem>
        {canWrite && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={onEdit}>
              <Pencil />
              Edit…
            </ContextMenuItem>
          </>
        )}
        {isAdmin && (
          <ContextMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 />
            Delete…
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
