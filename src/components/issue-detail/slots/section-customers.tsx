'use client';

// Slot — owned by D6. Customer requests linked to this issue: who asked, how
// important it is to them, and the revenue behind the issue. Requests aren't
// part of IssueRow, so they're fetched per issue; edits apply locally first
// and then resync from the server.

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowLeft, Link2, Plus, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';

import {
  addCustomerRequest,
  getIssueCustomers,
  removeCustomerRequest,
  updateCustomerRequest,
} from '@/app/actions/customers';
import { CustomerLogo, ImportanceIcon, RequestSourceIcon } from '@/components/customers/customer-glyphs';
import {
  IMPORTANCES,
  IMPORTANCE_LABEL,
  REQUEST_BODY_MAX,
  customerPath,
  formatRevenue,
  revenueSummary,
  type CustomerOption,
  type Importance,
  type IssueCustomerRequest,
} from '@/components/customers/customer-model';
import { SectionHeader } from '@/components/issue-hierarchy/issue-ref-row';
import { PickerPopover, digitShortcut, keywordFilter } from '@/components/issue-pickers';
import type { IssueMutations } from '@/components/issues/use-issue-mutations';
import { useProjectPermission } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import type { IssueRow } from '@/lib/issue-model';
import { cn } from '@/lib/utils';

const EXCERPT = 240;

function errorMessage(error: string) {
  return error === 'Forbidden' ? "You don't have permission to do that in this project." : error;
}

const isTemp = (id: string) => id.startsWith('temp-');

export function SectionCustomers({
  issue,
}: {
  issue: IssueRow;
  mutations: IssueMutations;
}) {
  const canWrite = useProjectPermission('write');
  const [requests, setRequests] = useState<IssueCustomerRequest[] | null>(null);
  const [options, setOptions] = useState<CustomerOption[]>([]);
  const [version, setVersion] = useState(0);
  const [adding, setAdding] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getIssueCustomers({ projectId: issue.projectId, ticketId: issue.id })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setRequests(result.requests);
          setOptions(result.customers);
        } else setRequests([]);
      })
      .catch(() => {
        if (!cancelled) setRequests((current) => current ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [issue.projectId, issue.id, version]);

  const resync = () => setVersion((v) => v + 1);
  const patchLocal = (id: string, patch: Partial<IssueCustomerRequest>) =>
    setRequests((current) => current?.map((r) => (r.id === id ? { ...r, ...patch } : r)) ?? null);

  const add = (
    customer: { id: string | null; name: string },
    importance: Importance | null,
    body: string,
  ) => {
    const known = customer.id ? options.find((o) => o.id === customer.id) : undefined;
    const temp: IssueCustomerRequest = {
      id: `temp-${crypto.randomUUID()}`,
      ticketId: issue.id,
      importance,
      source: 'manual',
      name: null,
      email: null,
      body,
      createdAt: new Date(),
      customer: {
        id: customer.id ?? `temp-${customer.name}`,
        name: customer.name,
        revenue: known?.revenue ?? null,
        status: 'active',
      },
    };
    setRequests((current) => [temp, ...(current ?? [])]);
    startTransition(async () => {
      try {
        const result = await addCustomerRequest({
          projectId: issue.projectId,
          ticketId: issue.id,
          customerId: customer.id,
          newCustomerName: customer.id ? null : customer.name,
          importance,
          body,
        });
        if (!result.ok) toast.error(errorMessage(result.error));
        else if (!customer.id) toast.success(`Created customer “${customer.name}”`);
      } catch {
        toast.error('Something went wrong — the request was not saved.');
      }
      resync();
    });
  };

  const update = (
    request: IssueCustomerRequest,
    patch: { importance?: Importance | null; customer?: CustomerOption },
  ) => {
    patchLocal(request.id, {
      ...(patch.importance !== undefined ? { importance: patch.importance } : {}),
      ...(patch.customer
        ? {
            customer: {
              id: patch.customer.id,
              name: patch.customer.name,
              revenue: patch.customer.revenue,
              status: 'active' as const,
            },
          }
        : {}),
    });
    startTransition(async () => {
      try {
        const result = await updateCustomerRequest({
          projectId: issue.projectId,
          id: request.id,
          ...(patch.importance !== undefined ? { importance: patch.importance } : {}),
          ...(patch.customer ? { customerId: patch.customer.id } : {}),
        });
        if (!result.ok) toast.error(errorMessage(result.error));
      } catch {
        toast.error('Something went wrong — the change was not saved.');
      }
      resync();
    });
  };

  const remove = (request: IssueCustomerRequest) => {
    setRequests((current) => current?.filter((r) => r.id !== request.id) ?? null);
    startTransition(async () => {
      try {
        const result = await removeCustomerRequest({ projectId: issue.projectId, id: request.id });
        if (!result.ok) toast.error(errorMessage(result.error));
      } catch {
        toast.error('Something went wrong — the request was not removed.');
      }
      resync();
    });
  };

  const list = requests ?? [];
  if (list.length === 0 && !canWrite) return null;

  const { total, customers } = revenueSummary(list);
  const meta =
    customers > 0 ? (
      <span className="text-xs text-muted-foreground tabular-nums">
        {total > 0 ? `${formatRevenue(total)} ARR across ` : ''}
        {customers} {customers === 1 ? 'customer' : 'customers'}
      </span>
    ) : undefined;

  return (
    <section aria-label="Customer requests" className="flex flex-col gap-1">
      <SectionHeader title="Customer requests" meta={meta}>
        {canWrite && (
          <PickerPopover
            open={adding}
            onOpenChange={setAdding}
            align="end"
            className="w-80"
            content={(close) => (
              <AddRequest
                options={options}
                onAdd={(customer, importance, body) => {
                  close();
                  add(customer, importance, body);
                }}
              />
            )}
          >
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Add customer request"
              title="Add customer request"
            >
              <Plus />
            </Button>
          </PickerPopover>
        )}
      </SectionHeader>

      {list.map((request) => (
        <RequestRow
          key={request.id}
          request={request}
          projectId={issue.projectId}
          options={options}
          canWrite={canWrite}
          onChange={(patch) => update(request, patch)}
          onRemove={() => remove(request)}
        />
      ))}

      {canWrite && requests !== null && list.length === 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-fit gap-2 font-normal text-muted-foreground"
          onClick={() => setAdding(true)}
        >
          <Plus />
          Add customer request
        </Button>
      )}
    </section>
  );
}

function RequestRow({
  request,
  projectId,
  options,
  canWrite,
  onChange,
  onRemove,
}: {
  request: IssueCustomerRequest;
  projectId: string;
  options: CustomerOption[];
  canWrite: boolean;
  onChange: (patch: { importance?: Importance | null; customer?: CustomerOption }) => void;
  onRemove: () => void;
}) {
  const pending = isTemp(request.id);
  const customer = request.customer;
  const excerpt =
    request.body.length > EXCERPT ? `${request.body.slice(0, EXCERPT)}…` : request.body;
  const requester = request.name ?? request.email;

  const importance = (
    <span className="flex size-6 items-center justify-center">
      <ImportanceIcon importance={request.importance} />
    </span>
  );

  return (
    <div
      className={cn(
        'group/req flex items-start gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/60',
        pending && 'opacity-60',
      )}
    >
      {canWrite && !pending ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Importance: ${request.importance ? IMPORTANCE_LABEL[request.importance] : 'none'}`}
              title="Importance"
              className="shrink-0 rounded-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {importance}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            {IMPORTANCES.map((level) => (
              <DropdownMenuItem
                key={level}
                data-checked={level === request.importance}
                onSelect={() => level !== request.importance && onChange({ importance: level })}
              >
                <ImportanceIcon importance={level} />
                {IMPORTANCE_LABEL[level]}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onSelect={() => request.importance && onChange({ importance: null })}>
              <ImportanceIcon importance={null} />
              No importance
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="shrink-0">{importance}</span>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-0.5">
        <div className="flex min-w-0 items-center gap-2">
          {customer ? (
            <>
              <CustomerLogo name={customer.name} size={16} />
              {isTemp(customer.id) ? (
                <span className="truncate font-medium">{customer.name}</span>
              ) : (
                <Link
                  href={customerPath(projectId, customer.id)}
                  className="truncate font-medium hover:underline"
                >
                  {customer.name}
                </Link>
              )}
              {customer.revenue != null && (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatRevenue(customer.revenue)}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="truncate text-muted-foreground">{requester ?? 'Unknown requester'}</span>
              {canWrite && !pending && (
                <PickerPopover
                  className="w-64"
                  content={(close) => (
                    <CustomerOptions
                      options={options}
                      onSelect={(option) => {
                        close();
                        onChange({ customer: option });
                      }}
                    />
                  )}
                >
                  <Button variant="ghost" size="xs" className="shrink-0 font-normal text-muted-foreground">
                    <Link2 />
                    Link customer
                  </Button>
                </PickerPopover>
              )}
            </>
          )}
          <RequestSourceIcon source={request.source} className="ml-auto size-3" />
        </div>
        {customer && requester && (
          <span className="truncate text-xs text-muted-foreground">{requester}</span>
        )}
        {excerpt && (
          <p className="line-clamp-2 text-xs whitespace-pre-wrap text-muted-foreground">{excerpt}</p>
        )}
      </div>

      {canWrite && !pending && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Remove request${customer ? ` from ${customer.name}` : ''}`}
          title="Remove request"
          onClick={onRemove}
          className="mt-0.5 shrink-0 opacity-0 group-hover/req:opacity-100 focus-visible:opacity-100"
        >
          <X />
        </Button>
      )}
    </div>
  );
}

/** Searchable customer list; `onCreate` adds a "Create customer" item for new names. */
function CustomerOptions({
  options,
  onSelect,
  onCreate,
}: {
  options: CustomerOption[];
  onSelect: (option: CustomerOption) => void;
  onCreate?: (name: string) => void;
}) {
  const [search, setSearch] = useState('');
  const name = search.trim();
  const exact = options.some((o) => o.name.toLowerCase() === name.toLowerCase());
  return (
    <Command filter={keywordFilter}>
      <CommandInput
        value={search}
        onValueChange={setSearch}
        placeholder={onCreate ? 'Find or create customer…' : 'Find customer…'}
      />
      <CommandList>
        <CommandEmpty>{onCreate ? 'Type a name to create a customer.' : 'No customers found.'}</CommandEmpty>
        {options.length > 0 && (
          <CommandGroup>
            {options.map((option) => (
              <CommandItem
                key={option.id}
                value={option.id}
                keywords={[option.name, ...option.domains]}
                onSelect={() => onSelect(option)}
              >
                <CustomerLogo name={option.name} size={16} />
                <span className="truncate">{option.name}</span>
                {option.revenue != null && (
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                    {formatRevenue(option.revenue)}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {onCreate && name && !exact && (
          <CommandGroup forceMount>
            <CommandItem
              value="__create__"
              keywords={[name]}
              forceMount
              onSelect={() => onCreate(name)}
            >
              <UserPlus />
              <span className="truncate">Create customer “{name}”</span>
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}

/** Two steps in one popover: the customer, then importance + an optional note. */
function AddRequest({
  options,
  onAdd,
}: {
  options: CustomerOption[];
  onAdd: (customer: { id: string | null; name: string }, importance: Importance | null, body: string) => void;
}) {
  const [customer, setCustomer] = useState<{ id: string | null; name: string } | null>(null);
  const [importance, setImportance] = useState<Importance | null>('medium');
  const [body, setBody] = useState('');

  if (!customer) {
    return (
      <CustomerOptions
        options={options}
        onSelect={(option) => setCustomer({ id: option.id, name: option.name })}
        onCreate={(name) => setCustomer({ id: null, name })}
      />
    );
  }

  const submit = () => onAdd(customer, importance, body.trim());
  // Low → critical reads left to right, like a meter.
  const levels = [...IMPORTANCES].reverse();

  return (
    <div
      className="flex flex-col gap-3 p-3"
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          submit();
        }
      }}
    >
      <div className="flex items-center gap-2 text-sm">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Back to customers"
          onClick={() => setCustomer(null)}
        >
          <ArrowLeft />
        </Button>
        <CustomerLogo name={customer.name} size={16} />
        <span className="truncate font-medium">{customer.name}</span>
        {!customer.id && <span className="shrink-0 text-xs text-muted-foreground">New</span>}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">Importance</span>
        <div
          role="radiogroup"
          aria-label="Importance"
          className="grid grid-cols-4 gap-1"
          onKeyDown={digitShortcut('', (digit) => {
            const level = levels[digit - 1];
            if (level) setImportance(level);
            return Boolean(level);
          })}
        >
          {levels.map((level, index) => (
            <button
              key={level}
              type="button"
              role="radio"
              aria-checked={importance === level}
              title={`${IMPORTANCE_LABEL[level]} (${index + 1})`}
              onClick={() => setImportance(importance === level ? null : level)}
              className={cn(
                'flex h-7 items-center justify-center gap-1 rounded-md border border-border text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50',
                importance === level && 'border-ring bg-accent',
              )}
            >
              <ImportanceIcon importance={level} className="size-3" />
              {IMPORTANCE_LABEL[level]}
            </button>
          ))}
        </div>
      </div>
      <Textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What did they ask for? (optional)"
        maxLength={REQUEST_BODY_MAX}
        aria-label="Request note"
        className="min-h-20 text-sm"
      />
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">⌘Enter to add</span>
        <Button size="sm" className="ml-auto" onClick={submit}>
          Add request
        </Button>
      </div>
    </div>
  );
}
