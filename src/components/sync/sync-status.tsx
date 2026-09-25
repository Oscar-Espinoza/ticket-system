'use client';

// "N changes pending sync" pill while the offline outbox holds this viewer's
// ops. Bottom-centre like B12's offline banner; offline it sits just above it.

import { useMemo, useSyncExternalStore } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';

import { flush, setSyncUser, useOutboxItems } from '@/lib/sync/outbox';
import { cn } from '@/lib/utils';

function subscribeOnline(notify: () => void) {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => {
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
  };
}

export function SyncStatus({ userId }: { userId: string }) {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const outbox = useOutboxItems();
  const pending = useMemo(() => outbox.filter((item) => item.userId === userId), [outbox, userId]);

  if (pending.length === 0) return null;
  const count = `${pending.length} ${pending.length === 1 ? 'change' : 'changes'} pending sync`;
  const details = pending.map((item) => item.label).join('\n');

  return (
    <div
      role="status"
      className={cn(
        'fixed left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2',
        online ? 'bottom-4' : 'bottom-14',
      )}
    >
      <button
        type="button"
        title={online ? `${details}\n\nClick to retry now` : details}
        disabled={!online}
        onClick={() => {
          setSyncUser(userId);
          void flush();
        }}
        className="flex max-w-full items-center gap-2 rounded-full border border-border bg-popover px-3 py-1 text-xs text-muted-foreground shadow-[var(--shadow-popover)] transition-colors enabled:hover:text-popover-foreground"
      >
        {online ? (
          <RefreshCw className="size-3.5 shrink-0 animate-spin [animation-duration:2s]" aria-hidden />
        ) : (
          <CloudOff className="size-3.5 shrink-0" aria-hidden />
        )}
        <span className="truncate">{online ? count : `Offline · ${count}`}</span>
      </button>
    </div>
  );
}
