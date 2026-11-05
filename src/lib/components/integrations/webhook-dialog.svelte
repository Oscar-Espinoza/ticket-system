<!-- Add / edit a webhook (WebhookDialog in webhook-settings.tsx). Mounted while open. -->
<script lang="ts">
  import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
  import { toast } from 'svelte-sonner';

  import { createWebhook, updateWebhook, type WebhookView } from '@/lib/actions/integrations';
  import Field from '@/lib/components/settings/field.svelte';
  import { Button } from '@/lib/components/ui/button';
  import { Checkbox } from '@/lib/components/ui/checkbox';
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/lib/components/ui/dialog';
  import { Input } from '@/lib/components/ui/input';
  import { Label } from '@/lib/components/ui/label';
  import { Switch } from '@/lib/components/ui/switch';
  import { WEBHOOK_EVENT_TYPES } from '@/lib/integrations/event-types';

  let {
    projectId,
    hook,
    onClose,
    onSaved,
  }: {
    projectId: string;
    hook: WebhookView | null;
    onClose: () => void;
    onSaved: (hook: WebhookView, secret?: string) => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let url = $state(hook?.url ?? '');
  // svelte-ignore state_referenced_locally
  let events = $state.raw<string[]>(hook?.events ?? []);
  // svelte-ignore state_referenced_locally
  let enabled = $state(hook?.enabled ?? true);
  let error = $state<string>();
  let pending = $state(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    pending = true;
    try {
      const result:
        | { ok: true; webhook: WebhookView; secret?: string }
        | { ok: false; error: string; field?: string }
        | undefined = hook
        ? await updateWebhook({ projectId, id: hook.id, url, events, enabled })
        : await createWebhook({ projectId, url, events, enabled });
      if (!result) return;
      if (!result.ok) {
        if (result.field === 'url') error = result.error;
        else toast.error(result.error);
        return;
      }
      toast.success(hook ? 'Webhook updated' : 'Webhook created');
      onSaved(result.webhook, result.secret);
    } finally {
      pending = false;
    }
  }

  const toggleEvent = (type: string, on: boolean) =>
    (events = on ? [...events, type] : events.filter((t) => t !== type));
</script>

<Dialog
  bind:open={() => true, (open) => {
    if (!open) onClose();
  }}
>
  <DialogContent>
    <form onsubmit={submit} novalidate class="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle>{hook ? 'Edit webhook' : 'Add webhook'}</DialogTitle>
        <DialogDescription>
          Deliveries time out after 5 seconds. Failures are retried after 1 min, 5 min, 30 min, 2 h and
          12 h.
        </DialogDescription>
      </DialogHeader>

      <Field id="webhook-url" label="Payload URL" {error}>
        <Input
          id="webhook-url"
          bind:value={() => url, (v) => {
            url = v;
            error = undefined;
          }}
          placeholder="https://example.com/hooks/tickets"
          autocomplete="off"
          spellcheck={false}
          autofocus
          class="font-mono text-xs"
          aria-invalid={!!error}
          aria-describedby={error ? 'webhook-url-error' : undefined}
        />
      </Field>

      <fieldset class="flex flex-col gap-2">
        <legend class="mb-1 text-sm font-medium">Events</legend>
        <p class="mb-1 text-xs text-muted-foreground">
          {events.length === 0 ? 'None selected — every event is sent.' : `${events.length} selected.`}
        </p>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {#each WEBHOOK_EVENT_TYPES as { type, label } (type)}
            <div class="flex items-center gap-2">
              <Checkbox
                id="event-{type}"
                checked={events.includes(type)}
                onCheckedChange={(on) => toggleEvent(type, on === true)}
              />
              <Label for="event-{type}" class="font-normal">{label}</Label>
            </div>
          {/each}
        </div>
      </fieldset>

      <div class="flex items-center gap-3">
        <Switch id="webhook-enabled" size="sm" bind:checked={enabled} />
        <Label for="webhook-enabled" class="font-normal">Active</Label>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onclick={onClose}>Cancel</Button>
        <Button type="submit" disabled={pending || !url.trim()}>
          {#if pending}<LoaderCircleIcon class="animate-spin" />{/if}
          {hook ? 'Save' : 'Add webhook'}
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
