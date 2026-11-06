<!-- The create / edit customer form. -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import UserRoundIcon from '@lucide/svelte/icons/user-round';
  import { toast } from 'svelte-sonner';

  import { createCustomer, updateCustomer } from '@/lib/actions/customers';
  import MemberPicker from '@/lib/components/epics/member-picker.svelte';
  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/lib/components/ui/dialog';
  import { Input } from '@/lib/components/ui/input';
  import { Label } from '@/lib/components/ui/label';
  import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/lib/components/ui/select';
  import { Avatar } from '@/lib/components/ui-icons';
  import {
    CUSTOMER_NAME_MAX,
    CUSTOMER_STATUSES,
    CUSTOMER_STATUS_LABEL,
    CUSTOMER_TIER_MAX,
    customerPath,
    isCustomerStatus,
    splitDomains,
    type CustomerRow,
    type CustomerStatus,
  } from '@/lib/customer-model';
  import { STATUS_DOT_CLASS } from './customer-glyphs';

  type Field = 'name' | 'domains' | 'tier' | 'revenue' | 'size' | 'ownerId';

  let {
    customer,
    tiers,
    openAfterCreate,
    onDone,
  }: {
    customer?: CustomerRow;
    tiers: string[];
    openAfterCreate: boolean;
    onDone: () => void;
  } = $props();

  const data = useProjectData();
  const uid = $props.id();

  /** "120k" / "1.5m" / "120,000" → 120000; '' → null; NaN when unparseable. */
  function parseAmount(value: string): number | null {
    const trimmed = value.trim().toLowerCase().replace(/[$,\s_]/g, '');
    if (!trimmed) return null;
    const match = /^(\d+(?:\.\d+)?)([km]?)$/.exec(trimmed);
    if (!match) return Number.NaN;
    const scale = match[2] === 'k' ? 1_000 : match[2] === 'm' ? 1_000_000 : 1;
    return Math.round(Number(match[1]) * scale);
  }

  // Seeded once per mount (the dialog remounts the form on every open), like useState.
  // svelte-ignore state_referenced_locally
  let name = $state(customer?.name ?? '');
  // svelte-ignore state_referenced_locally
  let domains = $state(customer?.domains.join(', ') ?? '');
  // svelte-ignore state_referenced_locally
  let status = $state<CustomerStatus>(customer?.status ?? 'active');
  // svelte-ignore state_referenced_locally
  let tier = $state(customer?.tier ?? '');
  // svelte-ignore state_referenced_locally
  let revenue = $state(customer?.revenue?.toString() ?? '');
  // svelte-ignore state_referenced_locally
  let size = $state(customer?.size?.toString() ?? '');
  // svelte-ignore state_referenced_locally
  let ownerId = $state<string | null>(customer ? (customer.owner?.id ?? null) : data.viewer.id);
  let error = $state<{ message: string; field?: Field } | null>(null);
  let pending = $state(false);

  const owner = $derived(data.members.find((m) => m.id === ownerId) ?? customer?.owner ?? null);

  async function submit(event?: Event) {
    event?.preventDefault();
    if (!name.trim() || pending) return;
    const revenueValue = parseAmount(revenue);
    const sizeValue = parseAmount(size);
    if (Number.isNaN(revenueValue)) {
      error = { message: 'Enter revenue as a number, e.g. 120000 or 120k.', field: 'revenue' };
      return;
    }
    if (Number.isNaN(sizeValue)) {
      error = { message: 'Enter size as a number of employees.', field: 'size' };
      return;
    }
    const input = {
      name,
      domains: splitDomains(domains),
      status,
      tier: tier.trim() || null,
      revenue: revenueValue,
      size: sizeValue,
      ownerId,
    };
    const projectId = data.project.id;
    pending = true;
    try {
      if (customer) {
        const result = await updateCustomer({ projectId, id: customer.id, patch: input });
        if (!result) return;
        if (!result.ok) {
          error = { message: result.error, field: result.field as Field | undefined };
          return;
        }
        toast.success('Customer updated');
        onDone();
        return;
      }
      const result = await createCustomer({ projectId, ...input });
      if (!result) return;
      if (!result.ok) {
        error = { message: result.error, field: result.field as Field | undefined };
        return;
      }
      toast.success(`Created customer “${name.trim()}”`);
      onDone();
      if (openAfterCreate) void goto(customerPath(projectId, result.id));
    } finally {
      pending = false;
    }
  }

  const invalid = (field: Field) => (error?.field === field ? true : undefined);
  const statusItems = CUSTOMER_STATUSES.map((s) => ({ value: s, label: CUSTOMER_STATUS_LABEL[s] }));
</script>

<DialogHeader>
  <DialogTitle>{customer ? 'Edit customer' : 'New customer'}</DialogTitle>
  <DialogDescription>
    Requests from these email domains are linked to the customer automatically.
  </DialogDescription>
</DialogHeader>
<!-- ⌘Enter submits from any field (the keydown bubbles up from the inputs), as in React. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<form
  onsubmit={submit}
  onkeydown={(event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submit(event);
  }}
  class="flex flex-col gap-4"
>
  <div class="flex flex-col gap-1.5">
    <Label for="{uid}-name">Name</Label>
    <Input
      id="{uid}-name"
      bind:value={name}
      placeholder="Acme Inc."
      maxlength={CUSTOMER_NAME_MAX}
      autofocus
      aria-invalid={invalid('name')}
    />
  </div>
  <div class="flex flex-col gap-1.5">
    <Label for="{uid}-domains">Domains</Label>
    <Input
      id="{uid}-domains"
      bind:value={domains}
      placeholder="acme.com, acme.io"
      aria-invalid={invalid('domains')}
      aria-describedby="{uid}-domains-hint"
    />
    <p id="{uid}-domains-hint" class="text-xs text-muted-foreground">
      Separate with commas. Subdomains match too.
    </p>
  </div>
  <div class="grid grid-cols-2 gap-3">
    <div class="flex flex-col gap-1.5">
      <Label for="{uid}-status">Status</Label>
      <Select
        items={statusItems}
        bind:value={() => status, (v) => {
          if (isCustomerStatus(v)) status = v;
        }}
      >
        <SelectTrigger id="{uid}-status" class="w-full">
          <SelectValue>
            {#snippet children()}
              <span class="size-2 rounded-full {STATUS_DOT_CLASS[status]}"></span>
              {CUSTOMER_STATUS_LABEL[status]}
            {/snippet}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {#each CUSTOMER_STATUSES as s (s)}
            <SelectItem value={s} label={CUSTOMER_STATUS_LABEL[s]}>
              <span class="size-2 rounded-full {STATUS_DOT_CLASS[s]}"></span>
              {CUSTOMER_STATUS_LABEL[s]}
            </SelectItem>
          {/each}
        </SelectContent>
      </Select>
    </div>
    <div class="flex flex-col gap-1.5">
      <Label for="{uid}-tier">Tier</Label>
      <Input
        id="{uid}-tier"
        bind:value={tier}
        placeholder="Enterprise"
        maxlength={CUSTOMER_TIER_MAX}
        list="{uid}-tiers"
        aria-invalid={invalid('tier')}
      />
      <datalist id="{uid}-tiers">
        {#each tiers as t (t)}
          <option value={t}></option>
        {/each}
      </datalist>
    </div>
    <div class="flex flex-col gap-1.5">
      <Label for="{uid}-revenue">Annual revenue (USD)</Label>
      <Input
        id="{uid}-revenue"
        bind:value={revenue}
        placeholder="120k"
        inputmode="decimal"
        aria-invalid={invalid('revenue')}
      />
    </div>
    <div class="flex flex-col gap-1.5">
      <Label for="{uid}-size">Size (employees)</Label>
      <Input
        id="{uid}-size"
        bind:value={size}
        placeholder="250"
        inputmode="numeric"
        aria-invalid={invalid('size')}
      />
    </div>
  </div>
  <div class="flex flex-col gap-1.5">
    <span class="text-sm font-medium">Owner</span>
    <MemberPicker
      value={ownerId}
      members={data.members}
      viewerId={data.viewer.id}
      onChange={(id) => (ownerId = id)}
      placeholder="Set owner…"
      noneLabel="No owner"
    >
      {#snippet children({ props })}
        <Button
          {...props}
          type="button"
          variant="outline"
          size="sm"
          class="w-fit font-normal"
          aria-label="Owner: {owner?.name ?? 'none'}"
        >
          {#if owner}
            <Avatar name={owner.name} src={owner.image} size={20} class="-my-1 size-4" />
            {owner.name}
          {:else}
            <UserRoundIcon />
            <span class="text-muted-foreground">No owner</span>
          {/if}
        </Button>
      {/snippet}
    </MemberPicker>
  </div>

  {#if error}
    <p role="alert" class="text-sm text-destructive">
      {error.message}
    </p>
  {/if}
  <DialogFooter>
    <Button type="button" variant="outline" onclick={onDone}>Cancel</Button>
    <Button type="submit" disabled={!name.trim() || pending}>
      {customer ? 'Save' : 'Create customer'}
    </Button>
  </DialogFooter>
</form>
