<!--
  Unread count next to Inbox. The layout (and so the server-rendered count)
  persists across client navigations, so it refreshes itself: every 60s while
  the tab is visible, when the tab comes back, on navigation (throttled) and
  right away when the inbox changes read state.
-->
<script lang="ts">
  import { page } from '$app/state';

  import { getUnreadNotificationCount } from '@/lib/actions/notifications';
  import { INBOX_CHANGED_EVENT } from '@/lib/notifications/types';

  const POLL_MS = 60_000;
  const STALE_MS = 15_000;

  let { initial }: { initial: number } = $props();

  // Re-seeded whenever the server count changes (React's seed/setSeed pattern).
  let count = $derived(initial);
  let fetchedAt = 0;

  async function refresh(force = false) {
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (!force && now - fetchedAt < STALE_MS) return;
    fetchedAt = now;
    try {
      count = await getUnreadNotificationCount();
    } catch {
      // Offline or signed out — keep the last known count.
    }
  }

  $effect(() => {
    fetchedAt = Date.now();
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
  });

  $effect(() => {
    void page.url.pathname;
    // Deferred: also coalesces a burst of navigations into one check.
    const timer = window.setTimeout(() => void refresh(), 500);
    return () => window.clearTimeout(timer);
  });
</script>

{#if count > 0}
  <span
    aria-label="{count} unread"
    class="shrink-0 rounded-full bg-sidebar-accent px-1.5 text-[11px] leading-4 font-medium text-sidebar-accent-foreground tabular-nums"
  >
    {count > 99 ? '99+' : count}
  </span>
{/if}
