<script lang="ts">
  import { pluralize } from '@/lib/format';
  import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
  import HistoryIcon from '@lucide/svelte/icons/history';
  import KeyRoundIcon from '@lucide/svelte/icons/key-round';
  import PencilIcon from '@lucide/svelte/icons/pencil';
  import PlusIcon from '@lucide/svelte/icons/plus';
  import SendIcon from '@lucide/svelte/icons/send';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';
  import WebhookIcon from '@lucide/svelte/icons/webhook';
  import { toast } from 'svelte-sonner';

  import {
    deleteWebhook,
    retryWebhookDeliveries,
    revealWebhookSecret,
    sendWebhookTest,
    updateWebhook,
    type WebhookView,
  } from '@/lib/actions/integrations';
  import { relativeTime } from '@/lib/relative-time';
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '@/lib/components/ui/alert-dialog';
  import { Button } from '@/lib/components/ui/button';
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/lib/components/ui/dialog';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/lib/components/ui/dropdown-menu';
  import { Switch } from '@/lib/components/ui/switch';
  import { EmptyState } from '@/lib/components/ui-icons';
  import { cn } from '@/lib/utils';
  import CopyField from './copy-field.svelte';
  import WebhookDeliveries from './webhook-deliveries.svelte';
  import WebhookDialog from './webhook-dialog.svelte';

  type Editing = { mode: 'create' } | { mode: 'edit'; hook: WebhookView } | null;

  let { projectId, webhooks: initial }: { projectId: string; webhooks: WebhookView[] } = $props();

  // svelte-ignore state_referenced_locally
  let hooks = $state.raw(initial);
  let editing = $state.raw<Editing>(null);
  let secret = $state.raw<{ value: string; isNew: boolean } | null>(null);
  let deleting = $state.raw<WebhookView | null>(null);
  let viewing = $state.raw<WebhookView | null>(null);

  // Lazy retries: opening this page resends the project's due deliveries (after
  // the response) — there's no background queue on the free tier.
  const hasHooks = $derived(initial.length > 0);
  $effect(() => {
    if (hasHooks) void retryWebhookDeliveries({ projectId }).catch(() => undefined);
  });

  const replace = (hook: WebhookView) => (hooks = hooks.map((h) => (h.id === hook.id ? hook : h)));

  async function toggle(hook: WebhookView, enabled: boolean) {
    replace({ ...hook, enabled });
    const result = await updateWebhook({ projectId, id: hook.id, enabled });
    if (!result) return;
    if (result.ok) replace(result.webhook);
    else {
      replace(hook);
      toast.error(result.error);
    }
  }

  async function test(hook: WebhookView) {
    const id = toast.loading('Sending test delivery…');
    const result = await sendWebhookTest({ projectId, id: hook.id });
    if (!result) {
      toast.dismiss(id);
      return;
    }
    if (result.ok) {
      replace(result.webhook);
      toast.success(`Delivered (HTTP ${result.webhook.lastStatus})`, { id });
    } else {
      toast.error(result.error, { id });
    }
  }

  async function reveal(hook: WebhookView) {
    const result = await revealWebhookSecret({ projectId, id: hook.id });
    if (!result) return;
    if (result.ok) secret = { value: result.secret, isNew: false };
    else toast.error(result.error);
  }

  async function remove(hook: WebhookView) {
    const result = await deleteWebhook({ projectId, id: hook.id });
    if (!result) return;
    if (result.ok) {
      hooks = hooks.filter((h) => h.id !== hook.id);
      toast.success('Webhook deleted');
    } else toast.error(result.error);
  }
</script>

{#snippet deliveryDot(status: number | null)}
  {@const ok = status !== null && status >= 200 && status < 300}
  <span
    aria-hidden="true"
    class={cn(
      'size-2 shrink-0 rounded-full',
      status === null ? 'bg-muted-foreground/40' : ok ? 'bg-emerald-500' : 'bg-red-500',
    )}
  ></span>
{/snippet}

{#snippet lastDelivery(hook: WebhookView)}
  {#if !hook.lastDeliveredAt}
    Never delivered
  {:else}
    <span title={new Date(hook.lastDeliveredAt).toLocaleString()}>
      {hook.lastStatus ? `HTTP ${hook.lastStatus}` : 'Failed'}
      {relativeTime(new Date(hook.lastDeliveredAt))}
    </span>
  {/if}
{/snippet}

{#snippet addButton()}
  <Button size="sm" onclick={() => (editing = { mode: 'create' })}>
    <PlusIcon />
    Add webhook
  </Button>
{/snippet}

<section class="flex flex-col gap-4">
  <div class="flex items-start justify-between gap-4">
    <div>
      <h2 class="text-base font-medium">Webhooks</h2>
      <p class="mt-1 text-sm text-muted-foreground">
        Send a signed JSON <span class="font-mono text-xs">POST</span> to your endpoint whenever issues
        change. Verify
        <span class="font-mono text-xs">X-Webhook-Signature</span> with the secret.
      </p>
    </div>
    {#if hooks.length > 0}
      <Button variant="outline" size="sm" onclick={() => (editing = { mode: 'create' })}>
        <PlusIcon />
        Add webhook
      </Button>
    {/if}
  </div>

  {#if hooks.length === 0}
    <EmptyState
      class="rounded-lg border border-dashed border-border py-10"
      title="No webhooks"
      description="Connect your own services to issue events."
      action={addButton}
    >
      {#snippet icon()}<WebhookIcon />{/snippet}
    </EmptyState>
  {:else}
    <ul class="divide-y divide-border rounded-lg border border-border">
      {#each hooks as hook (hook.id)}
        <li class="flex items-center gap-3 px-3 py-2.5">
          {@render deliveryDot(hook.lastStatus)}
          <div class="min-w-0 flex-1">
            <p class="truncate font-mono text-xs" title={hook.url}>{hook.url}</p>
            <p class="mt-0.5 truncate text-xs text-muted-foreground">
              {hook.events.length === 0
                ? 'All events'
                : `${pluralize(hook.events.length, 'event')}`}{' · '}<button
                type="button"
                class="hover:text-foreground hover:underline"
                onclick={() => (viewing = hook)}
              >
                {@render lastDelivery(hook)}
              </button>
            </p>
          </div>
          <!-- Strictly controlled: follows `hook.enabled` (set optimistically by toggle). -->
          <Switch
            size="sm"
            bind:checked={() => hook.enabled, (on) => toggle(hook, on)}
            aria-label={hook.enabled ? 'Disable webhook' : 'Enable webhook'}
          />
          <DropdownMenu>
            <DropdownMenuTrigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="icon-sm" aria-label="Webhook actions">
                  <EllipsisIcon />
                </Button>
              {/snippet}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => (viewing = hook)}>
                <HistoryIcon />
                Recent deliveries
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => (editing = { mode: 'edit', hook })}>
                <PencilIcon />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => test(hook)}>
                <SendIcon />
                Send test
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => reveal(hook)}>
                <KeyRoundIcon />
                Reveal secret
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => (deleting = hook)}>
                <Trash2Icon />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      {/each}
    </ul>
  {/if}

  {#if editing}
    {@const current = editing}
    {#key current.mode === 'edit' ? current.hook.id : 'new'}
      <WebhookDialog
        {projectId}
        hook={current.mode === 'edit' ? current.hook : null}
        onClose={() => (editing = null)}
        onSaved={(hook, newSecret) => {
          if (current.mode === 'edit') replace(hook);
          else hooks = [...hooks, hook];
          editing = null;
          if (newSecret) secret = { value: newSecret, isNew: true };
        }}
      />
    {/key}
  {/if}

  {#if viewing}
    <WebhookDeliveries {projectId} hook={viewing} onClose={() => (viewing = null)} onWebhookChange={replace} />
  {/if}

  <Dialog
    bind:open={() => !!secret, (open) => {
      if (!open) secret = null;
    }}
  >
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{secret?.isNew ? 'Webhook created' : 'Signing secret'}</DialogTitle>
        <DialogDescription>
          Compute HMAC-SHA256 of the raw request body with this secret and compare it to the
          <span class="font-mono text-xs">X-Webhook-Signature</span> header (<span class="font-mono text-xs"
            >sha256=…</span
          >).
        </DialogDescription>
      </DialogHeader>
      {#if secret}
        <CopyField value={secret.value} label="Secret" />
      {/if}
      <DialogFooter>
        <Button onclick={() => (secret = null)}>Done</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <AlertDialog
    bind:open={() => !!deleting, (open) => {
      if (!open) deleting = null;
    }}
  >
    <AlertDialogContent size="sm">
      <AlertDialogHeader>
        <AlertDialogTitle>Delete webhook?</AlertDialogTitle>
        <AlertDialogDescription>
          {deleting?.url} will stop receiving events immediately.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          onclick={() => {
            if (deleting) void remove(deleting);
          }}
        >
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</section>
