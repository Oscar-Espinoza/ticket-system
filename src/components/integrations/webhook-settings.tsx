'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  ChevronRight,
  History,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCw,
  Send,
  Trash2,
  Webhook,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  createWebhook,
  deleteWebhook,
  retryWebhookDeliveries,
  revealWebhookSecret,
  sendWebhookTest,
  listWebhookDeliveries,
  redeliverWebhookDelivery,
  updateWebhook,
  type WebhookDeliveryView,
  type WebhookView,
} from '@/app/actions/integrations';
import { relativeTime } from '@/components/issues/issue-properties';
import { Field } from '@/components/settings/field';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { EmptyState, Skeleton } from '@/components/ui-icons';
import { WEBHOOK_EVENT_TYPES } from '@/lib/integrations/event-types';
import { cn } from '@/lib/utils';
import { CopyField } from './copy-field';

type Editing = { mode: 'create' } | { mode: 'edit'; hook: WebhookView } | null;

export function WebhookSettings({
  projectId,
  webhooks: initial,
}: {
  projectId: string;
  webhooks: WebhookView[];
}) {
  const [hooks, setHooks] = useState(initial);
  const [editing, setEditing] = useState<Editing>(null);
  const [secret, setSecret] = useState<{ value: string; isNew: boolean } | null>(null);
  const [deleting, setDeleting] = useState<WebhookView | null>(null);
  const [viewing, setViewing] = useState<WebhookView | null>(null);
  const [, startTransition] = useTransition();

  // Lazy retries: opening this page resends the project's due deliveries (after
  // the response) — there's no background queue on the free tier.
  const hasHooks = initial.length > 0;
  useEffect(() => {
    if (hasHooks) void retryWebhookDeliveries({ projectId }).catch(() => undefined);
  }, [projectId, hasHooks]);

  const replace = (hook: WebhookView) =>
    setHooks((prev) => prev.map((h) => (h.id === hook.id ? hook : h)));

  function toggle(hook: WebhookView, enabled: boolean) {
    replace({ ...hook, enabled });
    startTransition(async () => {
      const result = await updateWebhook({ projectId, id: hook.id, enabled });
      if (result.ok) replace(result.webhook);
      else {
        replace(hook);
        toast.error(result.error);
      }
    });
  }

  function test(hook: WebhookView) {
    const id = toast.loading('Sending test delivery…');
    startTransition(async () => {
      const result = await sendWebhookTest({ projectId, id: hook.id });
      if (result.ok) {
        replace(result.webhook);
        toast.success(`Delivered (HTTP ${result.webhook.lastStatus})`, { id });
      } else {
        toast.error(result.error, { id });
      }
    });
  }

  function reveal(hook: WebhookView) {
    startTransition(async () => {
      const result = await revealWebhookSecret({ projectId, id: hook.id });
      if (result.ok) setSecret({ value: result.secret, isNew: false });
      else toast.error(result.error);
    });
  }

  function remove(hook: WebhookView) {
    startTransition(async () => {
      const result = await deleteWebhook({ projectId, id: hook.id });
      if (result.ok) {
        setHooks((prev) => prev.filter((h) => h.id !== hook.id));
        toast.success('Webhook deleted');
      } else toast.error(result.error);
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-medium">Webhooks</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Send a signed JSON <span className="font-mono text-xs">POST</span> to your endpoint
            whenever issues change. Verify{' '}
            <span className="font-mono text-xs">X-Webhook-Signature</span> with the secret.
          </p>
        </div>
        {hooks.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setEditing({ mode: 'create' })}>
            <Plus />
            Add webhook
          </Button>
        )}
      </div>

      {hooks.length === 0 ? (
        <EmptyState
          className="rounded-lg border border-dashed border-border py-10"
          icon={<Webhook />}
          title="No webhooks"
          description="Connect your own services to issue events."
          action={
            <Button size="sm" onClick={() => setEditing({ mode: 'create' })}>
              <Plus />
              Add webhook
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {hooks.map((hook) => (
            <li key={hook.id} className="flex items-center gap-3 px-3 py-2.5">
              <DeliveryDot status={hook.lastStatus} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs" title={hook.url}>
                  {hook.url}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {hook.events.length === 0
                    ? 'All events'
                    : `${hook.events.length} event${hook.events.length === 1 ? '' : 's'}`}
                  {' · '}
                  <button
                    type="button"
                    className="hover:text-foreground hover:underline"
                    onClick={() => setViewing(hook)}
                  >
                    <LastDelivery hook={hook} />
                  </button>
                </p>
              </div>
              <Switch
                size="sm"
                checked={hook.enabled}
                onCheckedChange={(on) => toggle(hook, on)}
                aria-label={hook.enabled ? 'Disable webhook' : 'Enable webhook'}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Webhook actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setViewing(hook)}>
                    <History />
                    Recent deliveries
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setEditing({ mode: 'edit', hook })}>
                    <Pencil />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => test(hook)}>
                    <Send />
                    Send test
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => reveal(hook)}>
                    <KeyRound />
                    Reveal secret
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(hook)}>
                    <Trash2 />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <WebhookDialog
          key={editing.mode === 'edit' ? editing.hook.id : 'new'}
          projectId={projectId}
          hook={editing.mode === 'edit' ? editing.hook : null}
          onClose={() => setEditing(null)}
          onSaved={(hook, newSecret) => {
            if (editing.mode === 'edit') replace(hook);
            else setHooks((prev) => [...prev, hook]);
            setEditing(null);
            if (newSecret) setSecret({ value: newSecret, isNew: true });
          }}
        />
      )}

      {viewing && (
        <WebhookDeliveries
          projectId={projectId}
          hook={viewing}
          onClose={() => setViewing(null)}
          onWebhookChange={replace}
        />
      )}

      <Dialog open={!!secret} onOpenChange={(open) => !open && setSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{secret?.isNew ? 'Webhook created' : 'Signing secret'}</DialogTitle>
            <DialogDescription>
              Compute HMAC-SHA256 of the raw request body with this secret and compare it to the{' '}
              <span className="font-mono text-xs">X-Webhook-Signature</span> header (
              <span className="font-mono text-xs">sha256=…</span>).
            </DialogDescription>
          </DialogHeader>
          {secret && <CopyField value={secret.value} label="Secret" />}
          <DialogFooter>
            <Button onClick={() => setSecret(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
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
              onClick={() => deleting && remove(deleting)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function DeliveryDot({ status }: { status: number | null }) {
  const ok = status !== null && status >= 200 && status < 300;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'size-2 shrink-0 rounded-full',
        status === null ? 'bg-muted-foreground/40' : ok ? 'bg-emerald-500' : 'bg-red-500',
      )}
    />
  );
}

function LastDelivery({ hook }: { hook: WebhookView }) {
  if (!hook.lastDeliveredAt) return <>Never delivered</>;
  const status = hook.lastStatus ? `HTTP ${hook.lastStatus}` : 'Failed';
  return (
    <span title={new Date(hook.lastDeliveredAt).toLocaleString()}>
      {status} {relativeTime(new Date(hook.lastDeliveredAt))}
    </span>
  );
}

function WebhookDialog({
  projectId,
  hook,
  onClose,
  onSaved,
}: {
  projectId: string;
  hook: WebhookView | null;
  onClose: () => void;
  onSaved: (hook: WebhookView, secret?: string) => void;
}) {
  const [url, setUrl] = useState(hook?.url ?? '');
  const [events, setEvents] = useState<string[]>(hook?.events ?? []);
  const [enabled, setEnabled] = useState(hook?.enabled ?? true);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result: { ok: true; webhook: WebhookView; secret?: string } | {
        ok: false;
        error: string;
        field?: string;
      } = hook
        ? await updateWebhook({ projectId, id: hook.id, url, events, enabled })
        : await createWebhook({ projectId, url, events, enabled });
      if (!result.ok) {
        if (result.field === 'url') setError(result.error);
        else toast.error(result.error);
        return;
      }
      toast.success(hook ? 'Webhook updated' : 'Webhook created');
      onSaved(result.webhook, result.secret);
    });
  }

  const toggleEvent = (type: string, on: boolean) =>
    setEvents((prev) => (on ? [...prev, type] : prev.filter((t) => t !== type)));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{hook ? 'Edit webhook' : 'Add webhook'}</DialogTitle>
            <DialogDescription>
              Deliveries time out after 5 seconds. Failures are retried after 1 min, 5 min,
              30 min, 2 h and 12 h.
            </DialogDescription>
          </DialogHeader>

          <Field id="webhook-url" label="Payload URL" error={error}>
            <Input
              id="webhook-url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(undefined);
              }}
              placeholder="https://example.com/hooks/tickets"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              className="font-mono text-xs"
              aria-invalid={!!error}
              aria-describedby={error ? 'webhook-url-error' : undefined}
            />
          </Field>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Events</legend>
            <p className="mb-1 text-xs text-muted-foreground">
              {events.length === 0 ? 'None selected — every event is sent.' : `${events.length} selected.`}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {WEBHOOK_EVENT_TYPES.map(({ type, label }) => (
                <div key={type} className="flex items-center gap-2">
                  <Checkbox
                    id={`event-${type}`}
                    checked={events.includes(type)}
                    onCheckedChange={(on) => toggleEvent(type, on === true)}
                  />
                  <Label htmlFor={`event-${type}`} className="font-normal">
                    {label}
                  </Label>
                </div>
              ))}
            </div>
          </fieldset>

          <div className="flex items-center gap-3">
            <Switch id="webhook-enabled" size="sm" checked={enabled} onCheckedChange={setEnabled} />
            <Label htmlFor="webhook-enabled" className="font-normal">
              Active
            </Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !url.trim()}>
              {pending && <Loader2 className="animate-spin" />}
              {hook ? 'Save' : 'Add webhook'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delivery log
// ---------------------------------------------------------------------------

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

function WebhookDeliveries({
  projectId,
  hook,
  onClose,
  onWebhookChange,
}: {
  projectId: string;
  hook: WebhookView;
  onClose: () => void;
  onWebhookChange: (hook: WebhookView) => void;
}) {
  const [deliveries, setDeliveries] = useState<WebhookDeliveryView[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listWebhookDeliveries({ projectId, webhookId: hook.id }).then(
      (result) => {
        if (!live) return;
        if (result.ok) setDeliveries(result.deliveries);
        else {
          toast.error(result.error);
          setDeliveries([]);
        }
      },
      () => live && setDeliveries([]),
    );
    return () => {
      live = false;
    };
  }, [projectId, hook.id]);

  async function resend(delivery: WebhookDeliveryView) {
    setSending(delivery.id);
    const result = await redeliverWebhookDelivery({
      projectId,
      webhookId: hook.id,
      deliveryId: delivery.id,
    });
    setSending(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setDeliveries((prev) => prev?.map((d) => (d.id === delivery.id ? result.delivery : d)) ?? null);
    onWebhookChange(result.webhook);
    if (result.delivery.deliveredAt) toast.success(`Delivered (HTTP ${result.delivery.status})`);
    else toast.error(result.delivery.error ?? 'Delivery failed');
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Recent deliveries</DialogTitle>
          <DialogDescription className="truncate font-mono text-xs" title={hook.url}>
            {hook.url}
          </DialogDescription>
        </DialogHeader>

        {deliveries === null ? (
          <div className="flex flex-col gap-2 py-2" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} />
            ))}
          </div>
        ) : deliveries.length === 0 ? (
          <EmptyState
            className="py-8"
            icon={<History />}
            title="No deliveries yet"
            description="Deliveries appear here as issue events are sent. Try “Send test”."
          />
        ) : (
          <ul className="-mx-1 max-h-[60vh] divide-y divide-border overflow-y-auto">
            {deliveries.map((d) => {
              const outcome = deliveryOutcome(d);
              const expanded = open === d.id;
              return (
                <li key={d.id} className="px-1">
                  <div className="flex items-center gap-2 py-2">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      aria-expanded={expanded}
                      onClick={() => setOpen(expanded ? null : d.id)}
                    >
                      <ChevronRight
                        className={cn(
                          'size-3.5 shrink-0 text-muted-foreground transition-transform',
                          expanded && 'rotate-90',
                        )}
                      />
                      <span
                        aria-hidden="true"
                        className={cn(
                          'size-2 shrink-0 rounded-full',
                          outcome.tone === 'ok'
                            ? 'bg-emerald-500'
                            : outcome.tone === 'pending'
                              ? 'bg-amber-500'
                              : 'bg-red-500',
                        )}
                      />
                      <span className="truncate font-mono text-xs">{d.eventType}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {d.status === null ? 'Not sent' : d.status === 0 ? 'No response' : `HTTP ${d.status}`}
                      </span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {outcome.label}
                        {d.attempt > 1 && outcome.tone === 'ok' ? ` · attempt ${d.attempt}` : ''}
                        {' · '}
                        <span title={new Date(d.createdAt).toLocaleString()}>
                          {relativeTime(new Date(d.createdAt))}
                        </span>
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Redeliver"
                      title="Redeliver"
                      disabled={sending !== null}
                      onClick={() => resend(d)}
                    >
                      {sending === d.id ? <Loader2 className="animate-spin" /> : <RotateCw />}
                    </Button>
                  </div>
                  {expanded && (
                    <div className="mb-2 ml-5 flex flex-col gap-2">
                      {d.error && !d.deliveredAt && (
                        <p className="text-xs text-destructive">{d.error}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {d.attempt} attempt{d.attempt === 1 ? '' : 's'}
                        {d.deliveredAt &&
                          ` · delivered ${new Date(d.deliveredAt).toLocaleString()}`}
                      </p>
                      <pre className="max-h-64 overflow-auto rounded-md bg-muted px-3 py-2 font-mono text-[0.7rem] leading-relaxed">
                        {JSON.stringify(d.payload, null, 2)}
                      </pre>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
