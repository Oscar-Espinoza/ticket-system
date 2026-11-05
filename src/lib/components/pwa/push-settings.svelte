<!--
  Settings → Notifications → Push. The browser permission prompt only appears
  when the user clicks "Enable desktop notifications".
  Port of src/components/pwa/push-settings.tsx. Exports the PushDevice type:
    import PushSettings, { type PushDevice } from '@/lib/components/pwa/push-settings.svelte';
-->
<script module lang="ts">
  import { dev } from '$app/env';

  export interface PushDevice {
    id: string;
    endpoint: string;
    userAgent: string | null;
    createdAt: string;
  }

  type DeviceState =
    | { status: 'loading' }
    | { status: 'unsupported'; ios: boolean }
    | { status: 'denied' }
    | { status: 'ready'; endpoint: string | null };

  const SUBSCRIPTIONS_API = '/api/push/subscriptions';

  async function currentSubscription(): Promise<DeviceState> {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      return { status: 'unsupported', ios };
    }
    if (Notification.permission === 'denied') return { status: 'denied' };
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = await registration?.pushManager.getSubscription().catch(() => null);
    return { status: 'ready', endpoint: subscription?.endpoint ?? null };
  }

  async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (!existing) {
      // B12 registers the worker in production only; in dev register it in
      // push-only mode so it doesn't cache dev bundles.
      const script = dev ? '/sw.js?mode=push' : '/sw.js';
      await navigator.serviceWorker.register(script, { scope: '/', updateViaCache: 'none' });
    }
    return navigator.serviceWorker.ready;
  }

  async function subscribe(registration: ServiceWorkerRegistration, publicKey: string) {
    const options = { userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) };
    try {
      return (await registration.pushManager.getSubscription()) ?? (await registration.pushManager.subscribe(options));
    } catch {
      // Usually a subscription made with an older VAPID key: drop it and retry.
      await (await registration.pushManager.getSubscription())?.unsubscribe();
      return registration.pushManager.subscribe(options);
    }
  }

  function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
    const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const bytes = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }

  /** "Chrome on macOS" from a user agent; good enough for telling devices apart. */
  function deviceLabel(userAgent: string | null): { name: string; mobile: boolean } {
    const ua = userAgent ?? '';
    const browser = /Edg\//.test(ua)
      ? 'Edge'
      : /OPR\//.test(ua)
        ? 'Opera'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\//.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'Browser';
    const os = /iPhone|iPad|iPod/.test(ua)
      ? 'iOS'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'macOS'
            : /CrOS/.test(ua)
              ? 'ChromeOS'
              : /Linux/.test(ua)
                ? 'Linux'
                : null;
    return { name: os ? `${browser} on ${os}` : browser, mobile: /iPhone|iPod|Android.*Mobile/.test(ua) };
  }
</script>

<script lang="ts">
  import BellOffIcon from '@lucide/svelte/icons/bell-off';
  import BellRingIcon from '@lucide/svelte/icons/bell-ring';
  import LaptopIcon from '@lucide/svelte/icons/laptop';
  import SendIcon from '@lucide/svelte/icons/send';
  import SmartphoneIcon from '@lucide/svelte/icons/smartphone';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';
  import { toast } from 'svelte-sonner';

  import { sendTestPush, updateDeliverySettings } from '@/lib/actions/settings-notifications';
  import SwitchRow from '@/lib/components/inbox/switch-row.svelte';
  import { relativeTime } from '@/lib/components/issues/issue-properties';
  import { Button } from '@/lib/components/ui/button';
  import { refreshAfterWrite } from '@/lib/svelte/refresh.svelte';

  let {
    configured,
    publicKey,
    enabled: initialEnabled,
    devices,
  }: {
    configured: boolean;
    publicKey: string | null;
    enabled: boolean;
    devices: PushDevice[];
  } = $props();

  // useState(initialEnabled): seeded once.
  // svelte-ignore state_referenced_locally
  let enabled = $state(initialEnabled);
  let device = $state<DeviceState>({ status: 'loading' });
  let busy = $state(false);
  let testing = $state(false);

  $effect(() => {
    if (!configured) return;
    let cancelled = false;
    void currentSubscription().then((state) => {
      if (!cancelled) device = state;
    });
    return () => {
      cancelled = true;
    };
  });

  function togglePush(on: boolean) {
    enabled = on;
    void updateDeliverySettings({ push: on })
      .catch(() => null)
      .then((result) => {
        if (result?.ok) return;
        enabled = !on;
        toast.error(result?.error ?? 'Could not save your settings');
      });
  }

  /** startTransition: `busy` while the task runs. */
  async function whileBusy(task: () => Promise<void>) {
    busy = true;
    try {
      await task();
    } finally {
      busy = false;
    }
  }

  const enable = (key: string) =>
    whileBusy(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          device = permission === 'denied' ? { status: 'denied' } : { status: 'ready', endpoint: null };
          if (permission === 'denied') toast.error('Notifications are blocked for this site');
          return;
        }
        const registration = await ensureRegistration();
        const subscription = await subscribe(registration, key);
        const response = await fetch(SUBSCRIPTIONS_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription.toJSON()),
        });
        if (!response.ok) throw new Error(`save failed (${response.status})`);
        device = { status: 'ready', endpoint: subscription.endpoint };
        toast.success('Desktop notifications enabled on this device');
        await refreshAfterWrite();
      } catch (err) {
        console.error('[push] enable failed', err);
        toast.error('Could not enable notifications on this device');
      }
    });

  const remove = (target: { id?: string; endpoint: string }) =>
    whileBusy(async () => {
      try {
        const local = device.status === 'ready' && device.endpoint === target.endpoint;
        if (local) {
          const registration = await navigator.serviceWorker.getRegistration('/');
          await (await registration?.pushManager.getSubscription())?.unsubscribe();
          device = { status: 'ready', endpoint: null };
        }
        const response = await fetch(SUBSCRIPTIONS_API, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(target.id ? { id: target.id } : { endpoint: target.endpoint }),
        });
        if (!response.ok) throw new Error(`delete failed (${response.status})`);
        await refreshAfterWrite();
      } catch (err) {
        console.error('[push] remove failed', err);
        toast.error('Could not remove the device');
      }
    });

  async function test() {
    testing = true;
    try {
      const result = await sendTestPush().catch(() => null);
      if (!result?.ok) toast.error(result?.error ?? 'Could not send a test notification');
      else if (result.sent === 0) toast.error('No device accepted the notification. Try enabling it again.');
      else
        toast.success(
          `Test notification sent to ${result.sent} of ${result.devices} device${result.devices === 1 ? '' : 's'}`,
        );
    } finally {
      testing = false;
    }
  }

  const localEndpoint = $derived(device.status === 'ready' ? device.endpoint : null);
  const localSaved = $derived(!!localEndpoint && devices.some((d) => d.endpoint === localEndpoint));
</script>

{#if !configured || !publicKey}
  <div class="rounded-lg border border-dashed border-border p-4 text-sm">
    <p class="font-medium">Push notifications aren’t configured on this server</p>
    <p class="mt-1 text-muted-foreground">
      Generate a key pair with
      <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">npx web-push generate-vapid-keys</code>
      and set <code class="font-mono text-xs">PUBLIC_VAPID_PUBLIC_KEY</code>,
      <code class="font-mono text-xs">VAPID_PRIVATE_KEY</code> and
      <code class="font-mono text-xs">VAPID_SUBJECT</code> (e.g.
      <code class="font-mono text-xs">mailto:you@example.com</code>), then redeploy.
    </p>
  </div>
{:else}
  {@const key = publicKey}
  <div class="flex flex-col gap-4">
    <SwitchRow
      id="notify-push"
      label="Push notifications"
      description="Show a system notification on your subscribed devices for everything that reaches your inbox."
      checked={enabled}
      onChange={togglePush}
    />

    <div class="flex flex-wrap items-center gap-2 text-sm">
      {#if device.status === 'loading'}
        <!-- nothing until the browser state is known -->
      {:else if device.status === 'unsupported'}
        <p class="text-muted-foreground">
          This browser doesn’t support push notifications.{#if device.ios}{' On iPhone and iPad, add this app to your Home Screen first, then open it from there.'}{/if}
        </p>
      {:else if device.status === 'denied'}
        <p class="text-muted-foreground">
          Notifications are blocked for this site. Allow them in your browser’s site settings, then reload.
        </p>
      {:else if localSaved && localEndpoint}
        {@const endpoint = localEndpoint}
        <span class="flex items-center gap-1.5 text-muted-foreground">
          <BellRingIcon class="size-4" />
          This device receives notifications.
        </span>
        <Button variant="ghost" size="sm" disabled={busy} onclick={() => remove({ endpoint })}>
          <BellOffIcon />
          Disable on this device
        </Button>
      {:else}
        <Button variant="outline" size="sm" onclick={() => enable(key)} disabled={busy}>
          <BellRingIcon />
          {busy ? 'Enabling…' : 'Enable desktop notifications'}
        </Button>
      {/if}
    </div>

    {#if devices.length > 0}
      <div class="flex flex-col gap-2">
        <ul class="flex flex-col divide-y divide-border rounded-lg border border-border" aria-label="Devices">
          {#each devices as d (d.id)}
            {@const label = deviceLabel(d.userAgent)}
            {@const Icon = label.mobile ? SmartphoneIcon : LaptopIcon}
            <li class="flex items-center gap-3 px-4 py-2.5 text-sm">
              <Icon class="size-4 shrink-0 text-muted-foreground" />
              <span class="min-w-0 flex-1 truncate">
                {label.name}
                {#if d.endpoint === localEndpoint}
                  <span class="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">This device</span>
                {/if}
              </span>
              <!-- React's suppressHydrationWarning: hydration keeps the server text. -->
              <span class="shrink-0 text-xs text-muted-foreground">
                Added {relativeTime(new Date(d.createdAt))}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${label.name}`}
                title="Remove device"
                disabled={busy}
                onclick={() => remove({ id: d.id, endpoint: d.endpoint })}
              >
                <Trash2Icon />
              </Button>
            </li>
          {/each}
        </ul>
        <div>
          <Button variant="outline" size="sm" onclick={test} disabled={testing}>
            <SendIcon />
            {testing ? 'Sending…' : 'Send test notification'}
          </Button>
        </div>
      </div>
    {/if}
  </div>
{/if}
