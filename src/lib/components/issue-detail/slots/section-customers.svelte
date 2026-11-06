<!--
  Slot — owned by D6. Customer requests linked to this issue: who asked, how
  important it is to them, and the revenue behind the issue. Requests aren't
  part of IssueRow, so they're fetched per issue; edits apply locally first
  and then resync from the server.
-->
<script module lang="ts">
  function errorMessage(error: string) {
    return error === 'Forbidden' ? "You don't have permission to do that in this project." : error;
  }
</script>

<script lang="ts">
  import PlusIcon from '@lucide/svelte/icons/plus';
  import { toast } from 'svelte-sonner';

  import {
    addCustomerRequest,
    getIssueCustomers,
    removeCustomerRequest,
    updateCustomerRequest,
  } from '@/lib/actions/customers';
  import {
    formatRevenue,
    revenueSummary,
    type CustomerOption,
    type Importance,
    type IssueCustomerRequest,
  } from '@/lib/customer-model';
  import SectionHeader from '@/lib/components/issue-hierarchy/section-header.svelte';
  import PickerPopover from '@/lib/components/issue-pickers/picker-popover.svelte';
  import type { IssueMutations } from '@/lib/components/issues/use-issue-mutations.svelte';
  import { useProjectPermission } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import type { IssueRow } from '@/lib/issue-model';
  import AddCustomerRequest from './add-customer-request.svelte';
  import CustomerRequestRow from './customer-request-row.svelte';

  let { issue }: { issue: IssueRow; mutations: IssueMutations } = $props();

  const canWritePermission = useProjectPermission('write');
  const canWrite = $derived(canWritePermission.current);
  let requests = $state.raw<IssueCustomerRequest[] | null>(null);
  let options = $state.raw<CustomerOption[]>([]);
  let version = $state(0);
  let adding = $state(false);

  $effect(() => {
    const projectId = issue.projectId;
    const ticketId = issue.id;
    void version;
    let cancelled = false;
    getIssueCustomers({ projectId, ticketId })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          requests = result.requests;
          options = result.customers;
        } else requests = [];
      })
      .catch(() => {
        if (!cancelled) requests = requests ?? [];
      });
    return () => {
      cancelled = true;
    };
  });

  const resync = () => (version += 1);
  const patchLocal = (id: string, patch: Partial<IssueCustomerRequest>) =>
    (requests = requests?.map((r) => (r.id === id ? { ...r, ...patch } : r)) ?? null);

  async function add(customer: { id: string | null; name: string }, importance: Importance | null, body: string) {
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
    requests = [temp, ...(requests ?? [])];
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
  }

  async function update(
    request: IssueCustomerRequest,
    patch: { importance?: Importance | null; customer?: CustomerOption },
  ) {
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
  }

  async function remove(request: IssueCustomerRequest) {
    requests = requests?.filter((r) => r.id !== request.id) ?? null;
    try {
      const result = await removeCustomerRequest({ projectId: issue.projectId, id: request.id });
      if (!result.ok) toast.error(errorMessage(result.error));
    } catch {
      toast.error('Something went wrong — the request was not removed.');
    }
    resync();
  }

  const list = $derived(requests ?? []);
  const summary = $derived(revenueSummary(list));
</script>

{#snippet meta()}
  {#if summary.customers > 0}
    <span class="text-xs text-muted-foreground tabular-nums">
      {summary.total > 0 ? `${formatRevenue(summary.total)} ARR across ` : ''}{summary.customers}
      {summary.customers === 1 ? 'customer' : 'customers'}
    </span>
  {/if}
{/snippet}

{#if list.length > 0 || canWrite}
  <section aria-label="Customer requests" class="flex flex-col gap-1">
    <SectionHeader title="Customer requests" meta={summary.customers > 0 ? meta : undefined}>
      {#if canWrite}
        <PickerPopover bind:open={adding} align="end" class="w-80">
          {#snippet content(close)}
            <AddCustomerRequest
              {options}
              onAdd={(customer, importance, body) => {
                close();
                void add(customer, importance, body);
              }}
            />
          {/snippet}
          {#snippet children({ props })}
            <Button {...props} variant="ghost" size="icon-xs" aria-label="Add customer request" title="Add customer request">
              <PlusIcon />
            </Button>
          {/snippet}
        </PickerPopover>
      {/if}
    </SectionHeader>

    {#each list as request (request.id)}
      <CustomerRequestRow
        {request}
        projectId={issue.projectId}
        {options}
        {canWrite}
        onChange={(patch) => void update(request, patch)}
        onRemove={() => void remove(request)}
      />
    {/each}

    {#if canWrite && requests !== null && list.length === 0}
      <Button variant="ghost" size="sm" class="w-fit gap-2 font-normal text-muted-foreground" onclick={() => (adding = true)}>
        <PlusIcon />
        Add customer request
      </Button>
    {/if}
  </section>
{/if}
