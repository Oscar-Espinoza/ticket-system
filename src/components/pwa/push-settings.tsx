'use client';

// Settings → Notifications → Push. The browser permission prompt only appears
// when the user clicks "Enable desktop notifications".

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BellRing, BellOff, Laptop, Send, Smartphone, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { SwitchRow } from '@/components/inbox/notification-prefs-form';
import { relativeTime } from '@/components/issues/issue-properties';
import { sendTestPush, updateDeliverySettings } from '@/app/dashboard/settings/notifications/actions';

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

export function PushSettings({
  configured,
  publicKey,
  enabled: initialEnabled,
  devices,
}: {
  configured: boolean;
  publicKey: string | null;
  enabled: boolean;
  devices: PushDevice[];
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [device, setDevice] = useState<DeviceState>({ status: 'loading' });
  const [busy, startBusy] = useTransition();
  const [testing, startTest] = useTransition();

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    void currentSubscription().then((state) => {
      if (!cancelled) setDevice(state);
    });
    return () => {
      cancelled = true;
    };
  }, [configured]);

  if (!configured || !publicKey) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-sm">
        <p className="font-medium">Push notifications aren’t configured on this server</p>
        <p className="mt-1 text-muted-foreground">
          Generate a key pair with{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">npx web-push generate-vapid-keys</code>{' '}
          and set <code className="font-mono text-xs">NEXT_PUBLIC_VAPID_PUBLIC_KEY</code>,{' '}
          <code className="font-mono text-xs">VAPID_PRIVATE_KEY</code> and{' '}
          <code className="font-mono text-xs">VAPID_SUBJECT</code> (e.g.{' '}
          <code className="font-mono text-xs">mailto:you@example.com</code>), then redeploy.
        </p>
      </div>
    );
  }

  const togglePush = (on: boolean) => {
    setEnabled(on);
    void updateDeliverySettings({ push: on })
      .catch(() => null)
      .then((result) => {
        if (result?.ok) return;
        setEnabled(!on);
        toast.error(result?.error ?? 'Could not save your settings');
      });
  };

  const enable = () =>
    startBusy(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setDevice(permission === 'denied' ? { status: 'denied' } : { status: 'ready', endpoint: null });
          if (permission === 'denied') toast.error('Notifications are blocked for this site');
          return;
        }
        const registration = await ensureRegistration();
        const subscription = await subscribe(registration, publicKey);
        const response = await fetch(SUBSCRIPTIONS_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription.toJSON()),
        });
        if (!response.ok) throw new Error(`save failed (${response.status})`);
        setDevice({ status: 'ready', endpoint: subscription.endpoint });
        toast.success('Desktop notifications enabled on this device');
        router.refresh();
      } catch (err) {
        console.error('[push] enable failed', err);
        toast.error('Could not enable notifications on this device');
      }
    });

  const remove = (target: { id?: string; endpoint: string }) =>
    startBusy(async () => {
      try {
        const local = device.status === 'ready' && device.endpoint === target.endpoint;
        if (local) {
          const registration = await navigator.serviceWorker.getRegistration('/');
          await (await registration?.pushManager.getSubscription())?.unsubscribe();
          setDevice({ status: 'ready', endpoint: null });
        }
        const response = await fetch(SUBSCRIPTIONS_API, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(target.id ? { id: target.id } : { endpoint: target.endpoint }),
        });
        if (!response.ok) throw new Error(`delete failed (${response.status})`);
        router.refresh();
      } catch (err) {
        console.error('[push] remove failed', err);
        toast.error('Could not remove the device');
      }
    });

  const test = () =>
    startTest(async () => {
      const result = await sendTestPush().catch(() => null);
      if (!result?.ok) toast.error(result?.error ?? 'Could not send a test notification');
      else if (result.sent === 0) toast.error('No device accepted the notification. Try enabling it again.');
      else toast.success(`Test notification sent to ${result.sent} of ${result.devices} device${result.devices === 1 ? '' : 's'}`);
    });

  const localEndpoint = device.status === 'ready' ? device.endpoint : null;
  const localSaved = !!localEndpoint && devices.some((d) => d.endpoint === localEndpoint);

  return (
    <div className="flex flex-col gap-4">
      <SwitchRow
        id="notify-push"
        label="Push notifications"
        description="Show a system notification on your subscribed devices for everything that reaches your inbox."
        checked={enabled}
        onChange={togglePush}
      />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {device.status === 'loading' ? null : device.status === 'unsupported' ? (
          <p className="text-muted-foreground">
            This browser doesn’t support push notifications.
            {device.ios && ' On iPhone and iPad, add this app to your Home Screen first, then open it from there.'}
          </p>
        ) : device.status === 'denied' ? (
          <p className="text-muted-foreground">
            Notifications are blocked for this site. Allow them in your browser’s site settings, then reload.
          </p>
        ) : localSaved ? (
          <>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <BellRing className="size-4" />
              This device receives notifications.
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => remove({ endpoint: localEndpoint! })}
            >
              <BellOff />
              Disable on this device
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={enable} disabled={busy}>
            <BellRing />
            {busy ? 'Enabling…' : 'Enable desktop notifications'}
          </Button>
        )}
      </div>

      {devices.length > 0 && (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border" aria-label="Devices">
            {devices.map((d) => {
              const label = deviceLabel(d.userAgent);
              const Icon = label.mobile ? Smartphone : Laptop;
              return (
                <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    {label.name}
                    {d.endpoint === localEndpoint && (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        This device
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground" suppressHydrationWarning>
                    Added {relativeTime(new Date(d.createdAt))}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${label.name}`}
                    title="Remove device"
                    disabled={busy}
                    onClick={() => remove({ id: d.id, endpoint: d.endpoint })}
                  >
                    <Trash2 />
                  </Button>
                </li>
              );
            })}
          </ul>
          <div>
            <Button variant="outline" size="sm" onClick={test} disabled={testing}>
              <Send />
              {testing ? 'Sending…' : 'Send test notification'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

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
    const script = process.env.NODE_ENV === 'production' ? '/sw.js' : '/sw.js?mode=push';
    await navigator.serviceWorker.register(script, { scope: '/', updateViaCache: 'none' });
  }
  return navigator.serviceWorker.ready;
}

async function subscribe(registration: ServiceWorkerRegistration, publicKey: string) {
  const options = { userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) };
  try {
    return (
      (await registration.pushManager.getSubscription()) ?? (await registration.pushManager.subscribe(options))
    );
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
