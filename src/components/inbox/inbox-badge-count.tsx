'use client';

// Unread count next to Inbox. The layout (and so the server-rendered count)
// persists across client navigations, so it refreshes itself: every 60s while
// the tab is visible, when the tab comes back, on navigation (throttled) and
// right away when the inbox changes read state.

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

import { getUnreadNotificationCount } from '@/app/actions/notifications';
import { INBOX_CHANGED_EVENT } from '@/lib/notifications/types';

const POLL_MS = 60_000;
const STALE_MS = 15_000;

export function InboxBadgeCount({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial);
  const [seed, setSeed] = useState(initial);
  if (seed !== initial) {
    setSeed(initial);
    setCount(initial);
  }
  const pathname = usePathname();
  const fetchedAt = useRef(0);

  const refresh = useEffectEvent(async (force = false) => {
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (!force && now - fetchedAt.current < STALE_MS) return;
    fetchedAt.current = now;
    try {
      setCount(await getUnreadNotificationCount());
    } catch {
      // Offline or signed out — keep the last known count.
    }
  });

  useEffect(() => {
    fetchedAt.current = Date.now();
    const interval = window.setInterval(() => void refresh(true), POLL_MS);
    const onVisible = () => void refresh();
    const onChanged = () => void refresh(true);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(INBOX_CHANGED_EVENT, onChanged);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(INBOX_CHANGED_EVENT, onChanged);
    };
  }, []);

  useEffect(() => {
    // Deferred: also coalesces a burst of navigations into one check.
    const timer = window.setTimeout(() => void refresh(), 500);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} unread`}
      className="shrink-0 rounded-full bg-sidebar-accent px-1.5 text-[11px] leading-4 font-medium text-sidebar-accent-foreground tabular-nums"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
