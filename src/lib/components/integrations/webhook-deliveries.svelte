<!-- Delivery log of one webhook (WebhookDeliveries in webhook-settings.tsx). Mounted while open. -->
<script lang="ts">
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
  import HistoryIcon from '@lucide/svelte/icons/history';
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
  import RotateCwIcon from '@lucide/svelte/icons/rotate-cw';
  import { toast } from 'svelte-sonner';

  import {
    listWebhookDeliveries,
    redeliverWebhookDelivery,
    type WebhookDeliveryView,
    type WebhookView,
  } from '@/lib/actions/integrations';
  import { relativeTime } from '@/lib/relative-time';
  import { Button } from '@/lib/components/ui/button';
  import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/lib/components/ui/dialog';
  import { EmptyState, Skeleton } from '@/lib/components/ui-icons';
  import { cn } from '@/lib/utils';

  let {
    projectId,
    hook,
    onClose,
    onWebhookChange,
  }: {
    projectId: string;
    hook: WebhookView;
    onClose: () => void;
    onWebhookChange: (hook: WebhookView) => void;
  } = $props();

  let deliveries = $state.raw<WebhookDeliveryView[] | null>(null);
  let open = $state<string | null>(null);
  let sending = $state<string | null>(null);

  function deliveryOutcome(d: WebhookDeliveryView): { label: string; tone: 'ok' | 'pending' | 'failed' } {
    if (d.deliveredAt) return { label: 'Delivered', tone: 'ok' };
    if (d.nextAttemptAt) {
      const at = new Date(d.nextAttemptAt);
      return {
        label: at.getTime() <= Date.now() ? 'Retry due' : `Retrying ${relativeTime(at)}`,
        tone: 'pending',
      };
    }
    return { label: d.attempt > 1 ? `Gave up after ${d.attempt} attempts` : 'Failed', tone: 'failed' };
  }

  // Loaded on open (a read action called from an effect, as React did on mount).
  const hookId = $derived(hook.id);
  $effect(() => {
    let live = true;
    listWebhookDeliveries({ projectId, webhookId: hookId }).then(
      (result) => {
        if (!live || !result) return;
        if (result.ok) deliveries = result.deliveries;
        else {
          toast.error(result.error);
          deliveries = [];
        }
      },
      () => {
        if (live) deliveries = [];
      },
    );
    return () => {
      live = false;
    };
  });

  async function resend(delivery: WebhookDeliveryView) {
    sending = delivery.id;
    const result = await redeliverWebhookDelivery({ projectId, webhookId: hook.id, deliveryId: delivery.id });
    sending = null;
    if (!result) return;
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    deliveries = deliveries?.map((d) => (d.id === delivery.id ? result.delivery : d)) ?? null;
    onWebhookChange(result.webhook);
    if (result.delivery.deliveredAt) toast.success(`Delivered (HTTP ${result.delivery.status})`);
    else toast.error(result.delivery.error ?? 'Delivery failed');
  }
</script>

<Dialog
  bind:open={() => true, (next) => {
    if (!next) onClose();
  }}
>
  <DialogContent class="sm:max-w-2xl">
    <DialogHeader>
      <DialogTitle>Recent deliveries</DialogTitle>
      <DialogDescription class="truncate font-mono text-xs" title={hook.url}>{hook.url}</DialogDescription>
    </DialogHeader>

    {#if deliveries === null}
      <div class="flex flex-col gap-2 py-2" aria-busy="true">
        {#each { length: 4 }, i (i)}
          <Skeleton />
        {/each}
      </div>
    {:else if deliveries.length === 0}
      <EmptyState
        class="py-8"
        title="No deliveries yet"
        description="Deliveries appear here as issue events are sent. Try “Send test”."
      >
        {#snippet icon()}<HistoryIcon />{/snippet}
      </EmptyState>
    {:else}
      <ul class="-mx-1 max-h-[60vh] divide-y divide-border overflow-y-auto">
        {#each deliveries as d (d.id)}
          {@const outcome = deliveryOutcome(d)}
          {@const expanded = open === d.id}
          <li class="px-1">
            <div class="flex items-center gap-2 py-2">
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-2 text-left"
                aria-expanded={expanded}
                onclick={() => (open = expanded ? null : d.id)}
              >
                <ChevronRightIcon
                  class={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-90')}
                />
                <span
                  aria-hidden="true"
                  class={cn(
                    'size-2 shrink-0 rounded-full',
                    outcome.tone === 'ok'
                      ? 'bg-emerald-500'
                      : outcome.tone === 'pending'
                        ? 'bg-amber-500'
                        : 'bg-red-500',
                  )}
                ></span>
                <span class="truncate font-mono text-xs">{d.eventType}</span>
                <span class="shrink-0 text-xs text-muted-foreground">
                  {d.status === null ? 'Not sent' : d.status === 0 ? 'No response' : `HTTP ${d.status}`}
                </span>
                <span class="ml-auto shrink-0 text-xs text-muted-foreground">
                  {outcome.label}{d.attempt > 1 && outcome.tone === 'ok' ? ` · attempt ${d.attempt}` : ''}{' · '}<span
                    title={new Date(d.createdAt).toLocaleString()}>{relativeTime(new Date(d.createdAt))}</span
                  >
                </span>
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Redeliver"
                title="Redeliver"
                disabled={sending !== null}
                onclick={() => resend(d)}
              >
                {#if sending === d.id}<LoaderCircleIcon class="animate-spin" />{:else}<RotateCwIcon />{/if}
              </Button>
            </div>
            {#if expanded}
              <div class="mb-2 ml-5 flex flex-col gap-2">
                {#if d.error && !d.deliveredAt}
                  <p class="text-xs text-destructive">{d.error}</p>
                {/if}
                <p class="text-xs text-muted-foreground">
                  {d.attempt} attempt{d.attempt === 1 ? '' : 's'}{d.deliveredAt
                    ? ` · delivered ${new Date(d.deliveredAt).toLocaleString()}`
                    : ''}
                </p>
                <pre
                  class="max-h-64 overflow-auto rounded-md bg-muted px-3 py-2 font-mono text-[0.7rem] leading-relaxed">{JSON.stringify(
                    d.payload,
                    null,
                    2,
                  )}</pre>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </DialogContent>
</Dialog>
