<!-- One customer row: a link with a right-click menu. -->
<script lang="ts">
  import Link2Icon from '@lucide/svelte/icons/link-2';
  import PencilIcon from '@lucide/svelte/icons/pencil';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';

  import {
    customerPath,
    formatRevenue,
    formatSize,
    type CustomerListRow,
  } from '@/lib/customer-model';
  import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
  } from '@/lib/components/ui/context-menu';
  import { Avatar } from '@/lib/components/ui-icons';
  import { copyToClipboard } from '@/lib/components/productivity/issue-actions';
  import { cn } from '@/lib/utils';
  import CustomerLogo from './customer-logo.svelte';
  import CustomerStatusChip from './customer-status-chip.svelte';

  let {
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
  } = $props();

  const href = $derived(customerPath(projectId, customer.id));

  const copyLink = () => copyToClipboard(new URL(href, window.location.origin).toString(), 'customer link');
</script>

<ContextMenu>
  <ContextMenuTrigger>
    {#snippet child({ props })}
      <a
        {...props}
        {href}
        role="row"
        data-customer-row={customer.id}
        class={cn(
          props.class as string | undefined,
          'flex min-h-10 items-center gap-3 border-b border-border px-3 py-1.5 text-sm outline-none hover:bg-accent/50 focus-visible:bg-accent',
          customer.status === 'churned' && 'text-muted-foreground',
        )}
      >
        <span role="cell" class="flex min-w-0 flex-1 items-center gap-2">
          <CustomerLogo name={customer.name} />
          <span class="truncate font-medium">{customer.name}</span>
          {#if customer.domains[0]}
            <span class="hidden truncate text-xs text-muted-foreground sm:inline">
              {customer.domains[0]}{customer.domains.length > 1 ? ` +${customer.domains.length - 1}` : ''}
            </span>
          {/if}
        </span>
        <span role="cell" class="hidden w-20 md:block">
          <CustomerStatusChip status={customer.status} />
        </span>
        <span role="cell" class="hidden w-24 truncate text-xs text-muted-foreground lg:block">
          {customer.tier ?? ''}
        </span>
        <span role="cell" class="w-20 text-right text-xs tabular-nums" title={formatRevenue(customer.revenue, true)}>
          {formatRevenue(customer.revenue)}
        </span>
        <span role="cell" class="hidden w-16 text-right text-xs text-muted-foreground tabular-nums lg:block">
          {formatSize(customer.size)}
        </span>
        <span
          role="cell"
          class="hidden w-6 md:block"
          title={customer.owner ? `Owner: ${customer.owner.name}` : 'No owner'}
        >
          {#if customer.owner}
            <Avatar name={customer.owner.name} src={customer.owner.image} size={20} />
          {/if}
        </span>
        <span role="cell" class="hidden w-18 text-right text-xs text-muted-foreground tabular-nums sm:block">
          {customer.requestCount || ''}
        </span>
        <span role="cell" class="w-12 text-right text-xs text-muted-foreground tabular-nums">
          {customer.openIssueCount || ''}
        </span>
      </a>
    {/snippet}
  </ContextMenuTrigger>
  <ContextMenuContent class="w-48">
    <ContextMenuItem>
      {#snippet child({ props })}
        <a {...props} {href}>Open</a>
      {/snippet}
    </ContextMenuItem>
    <ContextMenuItem onSelect={copyLink}>
      <Link2Icon />
      Copy link
    </ContextMenuItem>
    {#if canWrite}
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={onEdit}>
        <PencilIcon />
        Edit…
      </ContextMenuItem>
    {/if}
    {#if isAdmin}
      <ContextMenuItem variant="destructive" onSelect={onDelete}>
        <Trash2Icon />
        Delete…
      </ContextMenuItem>
    {/if}
  </ContextMenuContent>
</ContextMenu>
