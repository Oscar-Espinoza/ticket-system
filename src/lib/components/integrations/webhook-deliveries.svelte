<!-- Delivery log of one webhook. Mounted while open. -->
<script lang="ts">
  import { formatDate, m } from '@/lib/i18n';
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

    const DATE_TIME_FULL: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  };

  function deliveryOutcome(d: WebhookDeliveryView): { label: string; tone: 'ok' | 'pending' | 'failed' } {
    if (d.deliveredAt) return { label: m.settings_wh_delivered(), tone: 'ok' };
    if (d.nextAttemptAt) {
      const at = new Date(d.nextAttemptAt);
      return {
        label: at.getTime() <= Date.now()
          ? m.settings_wh_retry_due()
          : m.settings_wh_retrying({ when: relativeTime(at) }),
        tone: 'pending',
      };
    }
    return { label: d.attempt > 1 ? m.settings_wh_gave_up({ count: d.attempt }) : m.settings_wh_failed(), tone: 'failed' };
  }

  // Loaded on open (a read action called from an effect).
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
    if (result.delivery.deliveredAt) toast.success(m.settings_wh_delivered_toast({ status: result.delivery.status ?? '' }));
    else toast.error(result.delivery.error ?? m.settings_wh_delivery_failed_toast());
  }
</script>

<Dialog
  bind:open={() => true, (next) => {
    if (!next) onClose();
  }}
>
  <DialogContent class="sm:max-w-2xl">
    <DialogHeader>
      <DialogTitle>{m.settings_wh_recent_deliveries()}</DialogTitle>
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
        title={m.settings_wh_no_deliveries()}
        description={m.settings_wh_no_deliveries_hint()}
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
                  {d.status === null
                    ? m.settings_wh_not_sent()
                    : d.status === 0
                      ? m.settings_wh_no_response()
                      : `HTTP ${d.status}`}
                </span>
                <span class="ml-auto shrink-0 text-xs text-muted-foreground">
                  {outcome.label}{d.attempt > 1 && outcome.tone === 'ok' ? ` · ${m.settings_wh_attempt_n({ count: d.attempt })}` : ''}{' · '}<span
                    title={formatDate(d.createdAt, DATE_TIME_FULL)}>{relativeTime(new Date(d.createdAt))}</span
                  >
                </span>
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={m.settings_wh_redeliver()}
                title={m.settings_wh_redeliver()}
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
                  {m.settings_wh_attempts_count({ count: d.attempt })}{d.deliveredAt
                    ? ` · ${m.settings_wh_delivered_at({ date: formatDate(d.deliveredAt, DATE_TIME_FULL) })}`
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
