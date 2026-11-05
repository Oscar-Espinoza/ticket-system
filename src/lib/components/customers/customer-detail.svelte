<!--
  Customer page: header, notes (markdown), requests timeline and linked issues,
  with a property sidebar and the revenue this customer puts behind open work.
  Status / owner edits are optimistic and settle on the refreshed props.
-->
<script lang="ts">
  import { goto } from '$app/navigation';
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
  import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
  import Link2Icon from '@lucide/svelte/icons/link-2';
  import PencilIcon from '@lucide/svelte/icons/pencil';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';
  import UserRoundIcon from '@lucide/svelte/icons/user-round';
  import { toast } from 'svelte-sonner';

  import {
    CUSTOMER_STATUSES,
    CUSTOMER_STATUS_LABEL,
    customersPath,
    formatRevenue,
    formatSize,
    type CustomerRequestView,
    type CustomerRow,
  } from '@/components/customers/customer-model';
  import { updateCustomer, type CustomerInput } from '@/lib/actions/customers';
  import MemberPicker from '@/lib/components/epics/member-picker.svelte';
  import IssueRefRow from '@/lib/components/issue-hierarchy/issue-ref-row.svelte';
  import PropertyRow from '@/lib/components/issue-detail/property-row.svelte';
  import { useProjectData, useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { Avatar } from '@/lib/components/ui-icons';
  import type { IssueRow } from '@/lib/issue-model';
  import { cn } from '@/lib/utils';
  import { isClosed } from '@/lib/workflow';
  import CustomerDialog from './customer-dialog.svelte';
  import { STATUS_DOT_CLASS } from './customer-glyphs';
  import CustomerLogo from './customer-logo.svelte';
  import CustomerNotes from './customer-notes.svelte';
  import CustomerStatusChip from './customer-status-chip.svelte';
  import DeleteCustomerDialog from './delete-customer-dialog.svelte';
  import RequestsTimeline from './requests-timeline.svelte';

  let {
    customer: serverCustomer,
    requests,
    issues,
    tiers,
  }: {
    customer: CustomerRow;
    requests: CustomerRequestView[];
    issues: IssueRow[];
    tiers: string[];
  } = $props();

  const data = useProjectData();
  const canWrite = useProjectPermission('write');
  const isAdmin = useProjectPermission('admin');

  // useOptimistic: the server value plus the patch of every save still in flight. Each
  // patch is dropped when its own save settles: on success the refreshed props already
  // carry it (the action wrapper refreshes before resolving); on failure only that patch
  // rolls back, and other pending saves keep theirs.
  let pendingPatches = $state.raw<{ patch: Partial<CustomerRow> }[]>([]);
  const customer = $derived(
    pendingPatches.reduce<CustomerRow>((current, { patch }) => ({ ...current, ...patch }), serverCustomer),
  );
  let editing = $state(false);
  let deleting = $state(false);

  async function save(patch: CustomerInput, optimistic: Partial<CustomerRow>) {
    const id = customer.id;
    const entry = { patch: optimistic };
    pendingPatches = [...pendingPatches, entry];
    try {
      const result = await updateCustomer({ projectId: data.project.id, id, patch });
      if (result && !result.ok) toast.error(result.error);
    } finally {
      pendingPatches = pendingPatches.filter((p) => p !== entry);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href.split('?')[0]);
      toast.success('Copied customer link');
    } catch {
      toast.error('Could not copy to the clipboard.');
    }
  }

  const openIssues = $derived(issues.filter((issue) => !issue.archivedAt && !isClosed(issue.state.type)).length);
  const owner = $derived(customer.owner);
  const propertyButtonClass = '-ml-2 max-w-full gap-2 font-normal';

  const facts = $derived([
    ['Tier', customer.tier],
    ['Revenue', customer.revenue != null ? `${formatRevenue(customer.revenue, true)} / yr` : null],
    ['Size', customer.size != null ? `${formatSize(customer.size)} employees` : null],
  ] as const);
</script>

{#snippet statusTrigger(props: Record<string, unknown>)}
  <Button {...props} variant="ghost" size="sm" class={propertyButtonClass} disabled={!canWrite.current}>
    <span class={cn('size-2 rounded-full', STATUS_DOT_CLASS[customer.status])}></span>
    {CUSTOMER_STATUS_LABEL[customer.status]}
  </Button>
{/snippet}

{#snippet ownerTrigger(props: Record<string, unknown>)}
  <Button {...props} variant="ghost" size="sm" class={propertyButtonClass} disabled={!canWrite.current}>
    {#if owner}
      <Avatar name={owner.name} src={owner.image} size={20} />
      <span class="truncate">{owner.name}</span>
    {:else}
      <UserRoundIcon class="text-muted-foreground" />
      <span class="text-muted-foreground">No owner</span>
    {/if}
  </Button>
{/snippet}

<div class="flex min-h-0 flex-1 flex-col">
  <div class="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
    <a href={customersPath(data.project.id)} class="hover:text-foreground">Customers</a>
    <ChevronRightIcon class="size-3" />
    <span class="truncate text-foreground">{customer.name}</span>
  </div>

  <div class="mb-6 flex items-start gap-3">
    <CustomerLogo name={customer.name} size={28} class="mt-0.5" />
    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <h2 class="truncate text-xl font-medium">{customer.name}</h2>
        <CustomerStatusChip status={customer.status} />
      </div>
      {#if customer.domains.length > 0}
        <p class="truncate text-sm text-muted-foreground">{customer.domains.join(' · ')}</p>
      {/if}
    </div>
    <div class="ml-auto flex shrink-0 items-center gap-1">
      {#if canWrite.current}
        <Button variant="ghost" size="sm" onclick={() => (editing = true)}>
          <PencilIcon />
          Edit
        </Button>
      {/if}
      <DropdownMenu>
        <DropdownMenuTrigger>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="icon-sm" aria-label="Customer actions">
              <EllipsisIcon />
            </Button>
          {/snippet}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-48">
          <DropdownMenuItem onSelect={copyLink}>
            <Link2Icon />
            Copy link
          </DropdownMenuItem>
          {#if isAdmin.current}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => (deleting = true)}>
              <Trash2Icon />
              Delete customer…
            </DropdownMenuItem>
          {/if}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>

  <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
    <div class="flex min-w-0 flex-col gap-8">
      <CustomerNotes
        notes={customer.notes}
        canWrite={canWrite.current}
        onSave={(notes) => save({ notes }, { notes })}
      />
      <RequestsTimeline {requests} projectId={data.project.id} canWrite={canWrite.current} />
      <section aria-labelledby="customer-issues" class="flex flex-col gap-1">
        <h3 id="customer-issues" class="flex items-center gap-2 text-sm font-medium">
          Issues
          <span class="text-xs font-normal text-muted-foreground tabular-nums">{issues.length}</span>
        </h3>
        {#if issues.length === 0}
          <p class="text-sm text-muted-foreground">
            No linked issues. Add this customer from an issue’s “Customer requests” section.
          </p>
        {:else}
          <div class="flex flex-col">
            {#each issues as issue (issue.id)}
              <IssueRefRow {issue} />
            {/each}
          </div>
        {/if}
      </section>
    </div>

    <aside aria-label="Customer properties" class="flex flex-col gap-4">
      <div class="flex flex-col gap-1">
        <PropertyRow label="Status">
          {#if canWrite.current}
            <DropdownMenu>
              <DropdownMenuTrigger>
                {#snippet child({ props })}{@render statusTrigger(props)}{/snippet}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" class="w-40">
                {#each CUSTOMER_STATUSES as status (status)}
                  <DropdownMenuItem
                    onSelect={() => {
                      if (status !== customer.status) void save({ status }, { status });
                    }}
                  >
                    <span class={cn('size-2 rounded-full', STATUS_DOT_CLASS[status])}></span>
                    {CUSTOMER_STATUS_LABEL[status]}
                  </DropdownMenuItem>
                {/each}
              </DropdownMenuContent>
            </DropdownMenu>
          {:else}
            {@render statusTrigger({})}
          {/if}
        </PropertyRow>
        <PropertyRow label="Owner">
          {#if canWrite.current}
            <MemberPicker
              value={owner?.id ?? null}
              members={data.members}
              viewerId={data.viewer.id}
              placeholder="Set owner…"
              noneLabel="No owner"
              onChange={(ownerId) => {
                const member = data.members.find((m) => m.id === ownerId);
                void save(
                  { ownerId },
                  { owner: member ? { id: member.id, name: member.name, image: member.image } : null },
                );
              }}
            >
              {#snippet children({ props })}{@render ownerTrigger(props)}{/snippet}
            </MemberPicker>
          {:else}
            {@render ownerTrigger({})}
          {/if}
        </PropertyRow>
        {#each facts as [label, value] (label)}
          <PropertyRow {label}>
            {#if canWrite.current}
              <Button variant="ghost" size="sm" class={propertyButtonClass} onclick={() => (editing = true)}>
                {#if value != null}{value}{:else}<span class="text-muted-foreground">Set {label.toLowerCase()}</span>{/if}
              </Button>
            {:else}
              <span class="text-sm">
                {#if value != null}{value}{:else}<span class="text-muted-foreground">—</span>{/if}
              </span>
            {/if}
          </PropertyRow>
        {/each}
        <PropertyRow label="Domains">
          {#if customer.domains.length > 0}
            <div class="flex flex-wrap gap-x-2 gap-y-0.5 py-1 text-sm">
              {#each customer.domains as domain (domain)}
                <span class="truncate">{domain}</span>
              {/each}
            </div>
          {:else if canWrite.current}
            <Button variant="ghost" size="sm" class={propertyButtonClass} onclick={() => (editing = true)}>
              <span class="text-muted-foreground">Add domains</span>
            </Button>
          {:else}
            <span class="text-muted-foreground">—</span>
          {/if}
        </PropertyRow>
      </div>
      <div class="flex flex-col gap-2 border-t border-border pt-4">
        <span class="text-xs text-muted-foreground">Revenue impact</span>
        <p class="text-2xl font-medium tracking-tight tabular-nums">
          {#if customer.revenue != null}
            {formatRevenue(customer.revenue)}<span class="ml-1 text-sm font-normal text-muted-foreground">ARR</span>
          {:else}
            <span class="text-muted-foreground">—</span>
          {/if}
        </p>
        <p class="text-xs text-muted-foreground">
          Behind {openIssues} open {openIssues === 1 ? 'issue' : 'issues'} · {requests.length}
          {requests.length === 1 ? 'request' : 'requests'}
        </p>
      </div>
    </aside>
  </div>

  {#if canWrite.current}
    <CustomerDialog open={editing} onOpenChange={(open) => (editing = open)} {customer} {tiers} />
  {/if}
  {#if isAdmin.current}
    <DeleteCustomerDialog
      customer={deleting ? customer : null}
      onOpenChange={(open) => (deleting = open)}
      onDeleted={() => goto(customersPath(data.project.id))}
    />
  {/if}
</div>
