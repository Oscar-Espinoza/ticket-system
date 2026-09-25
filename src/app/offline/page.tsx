// Fallback the service worker serves for navigations it has no cached copy of.
// Static (no session, no data) so it can be precached at install time.

import type { Metadata } from 'next';
import { WifiOff } from 'lucide-react';

import { RetryButton } from './retry-button';

export const metadata: Metadata = { title: 'Offline' };
export const dynamic = 'force-static';

export default function OfflinePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
      <span
        aria-hidden
        className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <WifiOff className="size-4" />
      </span>
      <h1 className="text-lg font-medium">You&apos;re offline</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        This page hasn&apos;t been saved for offline use. Pages you opened recently still work
        read-only — reconnect to see the latest and make changes.
      </p>
      <RetryButton />
    </main>
  );
}
