<!-- A customer's requests, newest first, with unlink (RequestsTimeline in customer-detail.tsx). -->
<script lang="ts">
  import MessageSquareTextIcon from '@lucide/svelte/icons/message-square-text';
  import UnlinkIcon from '@lucide/svelte/icons/unlink';
  import { toast } from 'svelte-sonner';

  import {
    IMPORTANCE_LABEL,
    REQUEST_SOURCE_LABEL,
    type CustomerRequestView,
  } from '@/lib/components/customers/customer-model';
  import { updateCustomerRequest } from '@/lib/actions/customers';
  import { Button } from '@/lib/components/ui/button';
  import { EmptyState, StatusIcon } from '@/lib/components/ui-icons';
  import { issuePath } from '@/lib/issue-links';
  import { cn } from '@/lib/utils';
  import ImportanceIcon from './importance-icon.svelte';
  import RequestSourceIcon from './request-source-icon.svelte';

  let {
    requests,
    projectId,
    canWrite,
  }: {
    requests: CustomerRequestView[];
    projectId: string;
    canWrite: boolean;
  } = $props();

  const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });

  let hidden = $state<ReadonlySet<string>>(new Set());
  const shown = $derived(requests.filter((r) => !hidden.has(r.id)));

  async function unlink(request: CustomerRequestView) {
    hidden = new Set(hidden).add(request.id);
    const result = await updateCustomerRequest({ projectId, id: request.id, customerId: null });
    if (result && !result.ok) {
      toast.error(result.error);
      const next = new Set(hidden);
      next.delete(request.id);
      hidden = next;
    }
  }
</script>

<section aria-labelledby="customer-requests" class="flex flex-col gap-2">
  <h3 id="customer-requests" class="flex items-center gap-2 text-sm font-medium">
    Requests
    <span class="text-xs font-normal text-muted-foreground tabular-nums">{shown.length}</span>
  </h3>
  {#if shown.length === 0}
    <EmptyState
      class="rounded-lg border border-dashed border-border py-8"
      title="No requests yet"
      description="Requests arrive from the intake form (matched by email domain), Slack, or when someone adds this customer to an issue."
    >
      {#snippet icon()}<MessageSquareTextIcon />{/snippet}
    </EmptyState>
  {:else}
    <ol class="flex flex-col">
      {#each shown as request, index (request.id)}
        <li class="group/request relative flex gap-3 pb-4">
          <!-- Timeline rail -->
          {#if index < shown.length - 1}
            <span aria-hidden="true" class="absolute top-6 bottom-0 left-[9px] w-px bg-border"></span>
          {/if}
          <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted">
            <RequestSourceIcon source={request.source} class="size-3" />
          </span>
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span>{REQUEST_SOURCE_LABEL[request.source]}</span>
              {#if request.name || request.email}
                <span class="truncate">
                  · {request.name ?? request.email}{request.name && request.email ? ` <${request.email}>` : ''}
                </span>
              {/if}
              {#if request.importance}
                <span class="flex items-center gap-1">
                  · <ImportanceIcon importance={request.importance} class="size-3" />
                  {IMPORTANCE_LABEL[request.importance]}
                </span>
              {/if}
              <time datetime={new Date(request.createdAt).toISOString()} class="ml-auto">
                {dateFormat.format(new Date(request.createdAt))}
              </time>
              {#if canWrite}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Unlink request from this customer"
                  title="Unlink from customer"
                  onclick={() => unlink(request)}
                  class="opacity-0 group-hover/request:opacity-100 focus-visible:opacity-100"
                >
                  <UnlinkIcon />
                </Button>
              {/if}
            </div>
            {#if request.body}
              <p class="line-clamp-4 text-sm whitespace-pre-wrap">{request.body}</p>
            {/if}
            {#if request.issue}
              <a
                href={issuePath(request.issue.projectId, request.issue.key)}
                class="flex w-fit max-w-full items-center gap-2 rounded-md border border-border px-2 py-1 text-sm hover:bg-accent/50"
              >
                <StatusIcon
                  type={request.issue.stateType}
                  color={request.issue.stateColor ?? undefined}
                  aria-label={request.issue.stateName}
                  size={14}
                />
                <span class="shrink-0 font-mono text-xs text-muted-foreground">{request.issue.key}</span>
                <span class={cn('truncate', request.issue.archived && 'text-muted-foreground line-through')}>
                  {request.issue.title}
                </span>
              </a>
            {:else}
              <span class="text-xs text-muted-foreground">Not linked to an issue</span>
            {/if}
          </div>
        </li>
      {/each}
    </ol>
  {/if}
</section>
