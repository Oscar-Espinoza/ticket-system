'use client';

// Shown while the browser reports no network. Cached pages still open, and
// issue edits queue in the sync outbox (src/lib/sync/outbox.ts) until reconnect.

import { useSyncExternalStore } from 'react';
import { WifiOff } from 'lucide-react';

function subscribe(notify: () => void) {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => {
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
  };
}

export function OfflineBanner() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-popover px-3.5 py-1.5 text-xs text-popover-foreground shadow-[var(--shadow-popover)]"
    >
      <WifiOff className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span>You&apos;re offline — changes are saved on this device and sync when you reconnect.</span>
    </div>
  );
}
