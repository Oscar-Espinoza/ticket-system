<!-- One linked customer request of SectionCustomers (React's local RequestRow). -->
<script module lang="ts">
  const EXCERPT = 240;
  const isTemp = (id: string) => id.startsWith('temp-');
</script>

<script lang="ts">
  import Link2Icon from '@lucide/svelte/icons/link-2';
  import XIcon from '@lucide/svelte/icons/x';

  import {
    IMPORTANCES,
    IMPORTANCE_LABEL,
    customerPath,
    formatRevenue,
    type CustomerOption,
    type Importance,
    type IssueCustomerRequest,
  } from '@/lib/customer-model';
  import CustomerLogo from '@/lib/components/customers/customer-logo.svelte';
  import ImportanceIcon from '@/lib/components/customers/importance-icon.svelte';
  import RequestSourceIcon from '@/lib/components/customers/request-source-icon.svelte';
  import PickerPopover from '@/lib/components/issue-pickers/picker-popover.svelte';
  import { Button } from '@/lib/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { cn } from '@/lib/utils';
  import CustomerOptions from './customer-options.svelte';

  let {
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
  } = $props();

  const pending = $derived(isTemp(request.id));
  const customer = $derived(request.customer);
  const excerpt = $derived(request.body.length > EXCERPT ? `${request.body.slice(0, EXCERPT)}…` : request.body);
  const requester = $derived(request.name ?? request.email);
</script>

{#snippet importance()}
  <span class="flex size-6 items-center justify-center">
    <ImportanceIcon importance={request.importance} />
  </span>
{/snippet}

<div
  class={cn(
    'group/req flex items-start gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/60',
    pending && 'opacity-60',
  )}
>
  {#if canWrite && !pending}
    <DropdownMenu>
      <DropdownMenuTrigger>
        {#snippet child({ props })}
          <button
            {...props}
            type="button"
            aria-label={`Importance: ${request.importance ? IMPORTANCE_LABEL[request.importance] : 'none'}`}
            title="Importance"
            class="shrink-0 rounded-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {@render importance()}
          </button>
        {/snippet}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" class="w-40">
        {#each IMPORTANCES as level (level)}
          <DropdownMenuItem
            data-checked={level === request.importance}
            onSelect={() => level !== request.importance && onChange({ importance: level })}
          >
            <ImportanceIcon importance={level} />
            {IMPORTANCE_LABEL[level]}
          </DropdownMenuItem>
        {/each}
        <DropdownMenuItem onSelect={() => request.importance && onChange({ importance: null })}>
          <ImportanceIcon importance={null} />
          No importance
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  {:else}
    <span class="shrink-0">{@render importance()}</span>
  {/if}

  <div class="flex min-w-0 flex-1 flex-col gap-0.5 py-0.5">
    <div class="flex min-w-0 items-center gap-2">
      {#if customer}
        <CustomerLogo name={customer.name} size={16} />
        {#if isTemp(customer.id)}
          <span class="truncate font-medium">{customer.name}</span>
        {:else}
          <a href={customerPath(projectId, customer.id)} class="truncate font-medium hover:underline">
            {customer.name}
          </a>
        {/if}
        {#if customer.revenue != null}
          <span class="shrink-0 text-xs text-muted-foreground tabular-nums">
            {formatRevenue(customer.revenue)}
          </span>
        {/if}
      {:else}
        <span class="truncate text-muted-foreground">{requester ?? 'Unknown requester'}</span>
        {#if canWrite && !pending}
          <PickerPopover class="w-64">
            {#snippet content(close)}
              <CustomerOptions
                {options}
                onSelect={(option) => {
                  close();
                  onChange({ customer: option });
                }}
              />
            {/snippet}
            {#snippet children({ props })}
              <Button {...props} variant="ghost" size="xs" class="shrink-0 font-normal text-muted-foreground">
                <Link2Icon />
                Link customer
              </Button>
            {/snippet}
          </PickerPopover>
        {/if}
      {/if}
      <RequestSourceIcon source={request.source} class="ml-auto size-3" />
    </div>
    {#if customer && requester}
      <span class="truncate text-xs text-muted-foreground">{requester}</span>
    {/if}
    {#if excerpt}
      <p class="line-clamp-2 text-xs whitespace-pre-wrap text-muted-foreground">{excerpt}</p>
    {/if}
  </div>

  {#if canWrite && !pending}
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={`Remove request${customer ? ` from ${customer.name}` : ''}`}
      title="Remove request"
      onclick={onRemove}
      class="mt-0.5 shrink-0 opacity-0 group-hover/req:opacity-100 focus-visible:opacity-100"
    >
      <XIcon />
    </Button>
  {/if}
</div>
