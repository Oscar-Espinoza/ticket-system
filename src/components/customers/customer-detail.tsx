'use client';

// Customer page: header, notes (markdown), requests timeline and linked issues,
// with a property sidebar and the revenue this customer puts behind open work.
// Status / owner edits are optimistic and settle on the refreshed props.

import { useOptimistic, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  Link2,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Trash2,
  Unlink,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';

import { updateCustomer, updateCustomerRequest, type CustomerInput } from '@/app/actions/customers';
import { Markdown, MarkdownEditor } from '@/components/editor';
import { MemberPicker } from '@/components/epics/epic-pickers';
import { IssueRefRow } from '@/components/issue-hierarchy/issue-ref-row';
import { PropertyRow } from '@/components/issue-detail/property-row';
import { useProjectData, useProjectPermission } from '@/components/project/project-data';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, EmptyState, StatusIcon } from '@/components/ui-icons';
import { issuePath } from '@/lib/issue-links';
import type { IssueRow } from '@/lib/issue-model';
import { isClosed } from '@/lib/workflow';
import { cn } from '@/lib/utils';
import { CustomerDialog, DeleteCustomerDialog } from './customer-dialog';
import {
  CustomerLogo,
  CustomerStatusChip,
  ImportanceIcon,
  RequestSourceIcon,
  STATUS_DOT_CLASS,
} from './customer-glyphs';
import {
  CUSTOMER_NOTES_MAX,
  CUSTOMER_STATUSES,
  CUSTOMER_STATUS_LABEL,
  IMPORTANCE_LABEL,
  REQUEST_SOURCE_LABEL,
  customersPath,
  formatRevenue,
  formatSize,
  type CustomerRequestView,
  type CustomerRow,
} from './customer-model';

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

function PropertyButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('-ml-2 max-w-full gap-2 font-normal', className)}
      {...props}
    />
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

export function CustomerDetail({
  customer: serverCustomer,
  requests,
  issues,
  tiers,
}: {
  customer: CustomerRow;
  requests: CustomerRequestView[];
  issues: IssueRow[];
  tiers: string[];
}) {
  const { project, members, viewer } = useProjectData();
  const canWrite = useProjectPermission('write');
  const isAdmin = useProjectPermission('admin');
  const router = useRouter();
  const [customer, patchOptimistic] = useOptimistic(
    serverCustomer,
    (current, patch: Partial<CustomerRow>) => ({ ...current, ...patch }),
  );
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = (patch: CustomerInput, optimistic: Partial<CustomerRow>) =>
    startTransition(async () => {
      patchOptimistic(optimistic);
      const result = await updateCustomer({ projectId: project.id, id: customer.id, patch });
      if (!result.ok) toast.error(result.error);
    });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href.split('?')[0]);
      toast.success('Copied customer link');
    } catch {
      toast.error('Could not copy to the clipboard.');
    }
  };

  const openIssues = issues.filter(
    (issue) => !issue.archivedAt && !isClosed(issue.state.type),
  ).length;
  const owner = customer.owner;
  const picker = (trigger: ReactNode, wrap: (trigger: ReactNode) => ReactNode) =>
    canWrite ? wrap(trigger) : trigger;

  const sidebar = (
    <aside aria-label="Customer properties" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <PropertyRow label="Status">
          {picker(
            <PropertyButton disabled={!canWrite}>
              <span className={cn('size-2 rounded-full', STATUS_DOT_CLASS[customer.status])} />
              {CUSTOMER_STATUS_LABEL[customer.status]}
            </PropertyButton>,
            (trigger) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40">
                  {CUSTOMER_STATUSES.map((status) => (
                    <DropdownMenuItem
                      key={status}
                      onSelect={() => status !== customer.status && save({ status }, { status })}
                    >
                      <span className={cn('size-2 rounded-full', STATUS_DOT_CLASS[status])} />
                      {CUSTOMER_STATUS_LABEL[status]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ),
          )}
        </PropertyRow>
        <PropertyRow label="Owner">
          {picker(
            <PropertyButton disabled={!canWrite}>
              {owner ? (
                <>
                  <Avatar name={owner.name} src={owner.image} size={20} />
                  <span className="truncate">{owner.name}</span>
                </>
              ) : (
                <>
                  <UserRound className="text-muted-foreground" />
                  <Muted>No owner</Muted>
                </>
              )}
            </PropertyButton>,
            (trigger) => (
              <MemberPicker
                value={owner?.id ?? null}
                members={members}
                viewerId={viewer.id}
                placeholder="Set owner…"
                noneLabel="No owner"
                onChange={(ownerId) => {
                  const member = members.find((m) => m.id === ownerId);
                  save(
                    { ownerId },
                    { owner: member ? { id: member.id, name: member.name, image: member.image } : null },
                  );
                }}
              >
                {trigger}
              </MemberPicker>
            ),
          )}
        </PropertyRow>
        {(
          [
            ['Tier', customer.tier],
            ['Revenue', customer.revenue != null ? `${formatRevenue(customer.revenue, true)} / yr` : null],
            ['Size', customer.size != null ? `${formatSize(customer.size)} employees` : null],
          ] as const
        ).map(([label, value]) => (
          <PropertyRow key={label} label={label}>
            {canWrite ? (
              <PropertyButton onClick={() => setEditing(true)}>
                {value ?? <Muted>Set {label.toLowerCase()}</Muted>}
              </PropertyButton>
            ) : (
              <span className="text-sm">{value ?? <Muted>—</Muted>}</span>
            )}
          </PropertyRow>
        ))}
        <PropertyRow label="Domains">
          {customer.domains.length > 0 ? (
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 py-1 text-sm">
              {customer.domains.map((domain) => (
                <span key={domain} className="truncate">
                  {domain}
                </span>
              ))}
            </div>
          ) : canWrite ? (
            <PropertyButton onClick={() => setEditing(true)}>
              <Muted>Add domains</Muted>
            </PropertyButton>
          ) : (
            <Muted>—</Muted>
          )}
        </PropertyRow>
      </div>
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <span className="text-xs text-muted-foreground">Revenue impact</span>
        <p className="text-2xl font-medium tracking-tight tabular-nums">
          {customer.revenue != null ? formatRevenue(customer.revenue) : <Muted>—</Muted>}
          {customer.revenue != null && (
            <span className="ml-1 text-sm font-normal text-muted-foreground">ARR</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          Behind {openIssues} open {openIssues === 1 ? 'issue' : 'issues'} · {requests.length}{' '}
          {requests.length === 1 ? 'request' : 'requests'}
        </p>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
        <Link href={customersPath(project.id)} className="hover:text-foreground">
          Customers
        </Link>
        <ChevronRight className="size-3" />
        <span className="truncate text-foreground">{customer.name}</span>
      </div>

      <div className="mb-6 flex items-start gap-3">
        <CustomerLogo name={customer.name} size={28} className="mt-0.5" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-xl font-medium">{customer.name}</h2>
            <CustomerStatusChip status={customer.status} />
          </div>
          {customer.domains.length > 0 && (
            <p className="truncate text-sm text-muted-foreground">{customer.domains.join(' · ')}</p>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {canWrite && (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <Pencil />
              Edit
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Customer actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={copyLink}>
                <Link2 />
                Copy link
              </DropdownMenuItem>
              {isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                    <Trash2 />
                    Delete customer…
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <CustomerNotes
            notes={customer.notes}
            canWrite={canWrite}
            onSave={(notes) => save({ notes }, { notes })}
          />
          <RequestsTimeline requests={requests} projectId={project.id} canWrite={canWrite} />
          <section aria-labelledby="customer-issues" className="flex flex-col gap-1">
            <h3 id="customer-issues" className="flex items-center gap-2 text-sm font-medium">
              Issues
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                {issues.length}
              </span>
            </h3>
            {issues.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No linked issues. Add this customer from an issue’s “Customer requests” section.
              </p>
            ) : (
              <div className="flex flex-col">
                {issues.map((issue) => (
                  <IssueRefRow key={issue.id} issue={issue} />
                ))}
              </div>
            )}
          </section>
        </div>
        {sidebar}
      </div>

      {canWrite && (
        <CustomerDialog open={editing} onOpenChange={setEditing} customer={customer} tiers={tiers} />
      )}
      {isAdmin && (
        <DeleteCustomerDialog
          customer={deleting ? customer : null}
          onOpenChange={setDeleting}
          onDeleted={() => router.push(customersPath(project.id))}
        />
      )}
    </div>
  );
}

function CustomerNotes({
  notes,
  canWrite,
  onSave,
}: {
  notes: string | null;
  canWrite: boolean;
  onSave: (notes: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes ?? '');

  const start = () => {
    setDraft(notes ?? '');
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    const next = draft.trim() ? draft : null;
    if (next !== notes) onSave(next);
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <MarkdownEditor
          autoFocus
          aria-label="Notes"
          value={draft}
          onChange={setDraft}
          onSubmit={commit}
          onCancel={() => setEditing(false)}
          placeholder="Context, contacts, contract details… Markdown supported."
          maxLength={CUSTOMER_NOTES_MAX}
        />
        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto text-xs text-muted-foreground">⌘Enter to save · Esc to cancel</span>
          <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={commit}>
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <section aria-label="Notes" className="group relative">
      {notes ? (
        <Markdown>{notes}</Markdown>
      ) : (
        <p className="text-sm text-muted-foreground">{canWrite ? 'Add notes…' : 'No notes.'}</p>
      )}
      {canWrite && (
        <Button
          variant="ghost"
          size="xs"
          className={cn(
            'mt-2',
            notes && 'absolute -top-1 right-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          )}
          onClick={start}
        >
          <Pencil />
          {notes ? 'Edit' : 'Write notes'}
        </Button>
      )}
    </section>
  );
}

function RequestsTimeline({
  requests,
  projectId,
  canWrite,
}: {
  requests: CustomerRequestView[];
  projectId: string;
  canWrite: boolean;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  const shown = requests.filter((r) => !hidden.has(r.id));

  const unlink = (request: CustomerRequestView) =>
    startTransition(async () => {
      setHidden((current) => new Set(current).add(request.id));
      const result = await updateCustomerRequest({ projectId, id: request.id, customerId: null });
      if (!result.ok) {
        toast.error(result.error);
        setHidden((current) => {
          const next = new Set(current);
          next.delete(request.id);
          return next;
        });
      }
    });

  return (
    <section aria-labelledby="customer-requests" className="flex flex-col gap-2">
      <h3 id="customer-requests" className="flex items-center gap-2 text-sm font-medium">
        Requests
        <span className="text-xs font-normal text-muted-foreground tabular-nums">{shown.length}</span>
      </h3>
      {shown.length === 0 ? (
        <EmptyState
          className="rounded-lg border border-dashed border-border py-8"
          icon={<MessageSquareText />}
          title="No requests yet"
          description="Requests arrive from the intake form (matched by email domain), Slack, or when someone adds this customer to an issue."
        />
      ) : (
        <ol className="flex flex-col">
          {shown.map((request, index) => (
            <li key={request.id} className="group/request relative flex gap-3 pb-4">
              {/* Timeline rail */}
              {index < shown.length - 1 && (
                <span aria-hidden="true" className="absolute top-6 bottom-0 left-[9px] w-px bg-border" />
              )}
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted">
                <RequestSourceIcon source={request.source} className="size-3" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  <span>{REQUEST_SOURCE_LABEL[request.source]}</span>
                  {(request.name || request.email) && (
                    <span className="truncate">
                      · {request.name ?? request.email}
                      {request.name && request.email ? ` <${request.email}>` : ''}
                    </span>
                  )}
                  {request.importance && (
                    <span className="flex items-center gap-1">
                      · <ImportanceIcon importance={request.importance} className="size-3" />
                      {IMPORTANCE_LABEL[request.importance]}
                    </span>
                  )}
                  <time dateTime={new Date(request.createdAt).toISOString()} className="ml-auto" suppressHydrationWarning>
                    {dateFormat.format(new Date(request.createdAt))}
                  </time>
                  {canWrite && (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Unlink request from this customer"
                      title="Unlink from customer"
                      onClick={() => unlink(request)}
                      className="opacity-0 group-hover/request:opacity-100 focus-visible:opacity-100"
                    >
                      <Unlink />
                    </Button>
                  )}
                </div>
                {request.body && (
                  <p className="line-clamp-4 text-sm whitespace-pre-wrap">{request.body}</p>
                )}
                {request.issue ? (
                  <Link
                    href={issuePath(projectId, request.issue.key)}
                    className="flex w-fit max-w-full items-center gap-2 rounded-md border border-border px-2 py-1 text-sm hover:bg-accent/50"
                  >
                    <StatusIcon
                      type={request.issue.stateType}
                      color={request.issue.stateColor ?? undefined}
                      aria-label={request.issue.stateName}
                      size={14}
                    />
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {request.issue.key}
                    </span>
                    <span
                      className={cn(
                        'truncate',
                        request.issue.archived && 'text-muted-foreground line-through',
                      )}
                    >
                      {request.issue.title}
                    </span>
                  </Link>
                ) : (
                  <span className="text-xs text-muted-foreground">Not linked to an issue</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
