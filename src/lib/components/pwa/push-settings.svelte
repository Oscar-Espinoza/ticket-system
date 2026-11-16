<!--
  Settings → Notifications → Push. The browser permission prompt only appears
  when the user clicks "Enable desktop notifications".
  Exports the PushDevice type:
    import PushSettings, { type PushDevice } from '@/lib/components/pwa/push-settings.svelte';
-->
<script module lang="ts">
  import { dev } from '$app/env';

  import { m } from '@/lib/i18n';

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
              : m.auth_push_browser();
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
    return { name: os ? m.auth_push_browser_on_os({ browser, os }) : browser, mobile: /iPhone|iPod|Android.*Mobile/.test(ua) };
  }
</script>

<script lang="ts">
  import { m } from '@/lib/i18n';
  import BellOffIcon from '@lucide/svelte/icons/bell-off';
  import BellRingIcon from '@lucide/svelte/icons/bell-ring';
  import LaptopIcon from '@lucide/svelte/icons/laptop';
  import SendIcon from '@lucide/svelte/icons/send';
  import SmartphoneIcon from '@lucide/svelte/icons/smartphone';
  import Trash2Icon from '@lucide/svelte/icons/trash-2';
  import { toast } from 'svelte-sonner';

  import { sendTestPush, updateDeliverySettings } from '@/lib/actions/settings-notifications';
  import SwitchRow from '@/lib/components/inbox/switch-row.svelte';
  import { relativeTime } from '@/lib/relative-time';
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
        toast.error(result?.error ?? m.auth_push_save_failed());
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
          if (permission === 'denied') toast.error(m.auth_push_blocked_toast());
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
        toast.success(m.auth_push_enabled_toast());
        await refreshAfterWrite();
      } catch (err) {
        console.error('[push] enable failed', err);
        toast.error(m.auth_push_enable_failed());
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
        toast.error(m.auth_push_remove_failed());
      }
    });

  async function test() {
    testing = true;
    try {
      const result = await sendTestPush().catch(() => null);
      if (!result?.ok) toast.error(result?.error ?? m.auth_push_test_failed());
      else if (result.sent === 0) toast.error(m.auth_push_test_none());
      else
        toast.success(
          m.auth_push_test_sent({ sent: result.sent, devices: m.auth_push_devices({ count: result.devices }) }),
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
    <p class="font-medium">{m.auth_push_not_configured()}</p>
    <p class="mt-1 text-muted-foreground">
      {m.auth_push_cfg_generate()}
      <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">npx web-push generate-vapid-keys</code>
      {m.auth_push_cfg_set()} <code class="font-mono text-xs">PUBLIC_VAPID_PUBLIC_KEY</code>,
      <code class="font-mono text-xs">VAPID_PRIVATE_KEY</code> {m.auth_push_cfg_and()}
      <code class="font-mono text-xs">VAPID_SUBJECT</code> {m.auth_push_cfg_eg()}
      <code class="font-mono text-xs">mailto:you@example.com</code>{m.auth_push_cfg_redeploy()}
    </p>
  </div>
{:else}
  {@const key = publicKey}
  <div class="flex flex-col gap-4">
    <SwitchRow
      id="notify-push"
      label={m.auth_push_title()}
      description={m.auth_push_description()}
      checked={enabled}
      onChange={togglePush}
    />

    <div class="flex flex-wrap items-center gap-2 text-sm">
      {#if device.status === 'loading'}
        <!-- nothing until the browser state is known -->
      {:else if device.status === 'unsupported'}
        <p class="text-muted-foreground">
          {m.auth_push_unsupported()}{#if device.ios}{m.auth_push_ios_hint()}{/if}
        </p>
      {:else if device.status === 'denied'}
        <p class="text-muted-foreground">
          {m.auth_push_denied()}
        </p>
      {:else if localSaved && localEndpoint}
        {@const endpoint = localEndpoint}
        <span class="flex items-center gap-1.5 text-muted-foreground">
          <BellRingIcon class="size-4" />
          {m.auth_push_device_receives()}
        </span>
        <Button variant="ghost" size="sm" disabled={busy} onclick={() => remove({ endpoint })}>
          <BellOffIcon />
          {m.auth_push_disable()}
        </Button>
      {:else}
        <Button variant="outline" size="sm" onclick={() => enable(key)} disabled={busy}>
          <BellRingIcon />
          {busy ? m.auth_push_enabling() : m.auth_push_enable()}
        </Button>
      {/if}
    </div>

    {#if devices.length > 0}
      <div class="flex flex-col gap-2">
        <ul class="flex flex-col divide-y divide-border rounded-lg border border-border" aria-label={m.auth_push_devices_label()}>
          {#each devices as d (d.id)}
            {@const label = deviceLabel(d.userAgent)}
            {@const Icon = label.mobile ? SmartphoneIcon : LaptopIcon}
            <li class="flex items-center gap-3 px-4 py-2.5 text-sm">
              <Icon class="size-4 shrink-0 text-muted-foreground" />
              <span class="min-w-0 flex-1 truncate">
                {label.name}
                {#if d.endpoint === localEndpoint}
                  <span class="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{m.auth_push_this_device()}</span>
                {/if}
              </span>
              <!-- Hydration keeps the server text. -->
              <span class="shrink-0 text-xs text-muted-foreground">
                {m.auth_push_added({ when: relativeTime(new Date(d.createdAt)) })}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={m.auth_push_remove_aria({ name: label.name })}
                title={m.auth_push_remove_title()}
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
            {testing ? m.auth_push_sending() : m.auth_push_send_test()}
          </Button>
        </div>
      </div>
    {/if}
  </div>
{/if}
