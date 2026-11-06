<!--
  Mounted once by the project layout (the presence store is live-updates.svelte.ts).

  Live updates without websockets (Vercel Hobby): a short-lived SSE stream
  (`/api/projects/[id]/stream`) pushes the project's change token; when it
  moves, the page data is refreshed — debounced, and never while the user is
  typing (a refresh would clobber uncontrolled drafts). Streams reconnect with
  backoff and fall back to polling the token every 5 s. Paused while the tab is
  hidden or offline. Other tabs' saves arrive over a BroadcastChannel. Also
  keeps this project's presence channel alive and shows the offline-outbox status.
-->
<script module lang="ts">
  const POLL_MS = 5_000;
  const POLL_BACKOFF_MS = 30_000;
  const SSE_RECONNECT_MS = 250;
  const SSE_BACKOFF_MS = 1_000;
  const SSE_BACKOFF_MAX_MS = 30_000;
  /** Consecutive stream failures (no token in between) before falling back to polling. */
  const SSE_MAX_FAILURES = 3;
  const REFRESH_DEBOUNCE_MS = 400;

  const TEXT_INPUTS = new Set([
    'text', 'search', 'email', 'url', 'tel', 'password', 'number', 'date',
    'datetime-local', 'month', 'time', 'week',
  ]);

  /** A focused text field / editor — refreshing now could clobber what's typed. */
  function isEditing(): boolean {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement)) return false;
    if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
    return el instanceof HTMLInputElement && TEXT_INPUTS.has(el.type);
  }

  const stopStatus = (status: number) => status === 401 || status === 403 || status === 404;
</script>

<script lang="ts">
  import { untrack } from 'svelte';

  import { useProjectData } from '@/lib/components/project/project-data.svelte';
  import SyncStatus from '@/lib/components/sync/sync-status.svelte';
  import { onProjectChanged } from '@/lib/sync/broadcast';
  import { setSyncUser } from '@/lib/svelte/outbox.svelte';
  import { refreshAfterWrite } from '@/lib/svelte/refresh.svelte';
  import { useProjectPresence } from './live-updates.svelte.ts';

  let { projectId }: { projectId: string } = $props();

  const data = useProjectData();
  const viewerId = $derived(data.viewer.id);
  useProjectPresence(() => projectId);

  // Replays anything an earlier visit left in the offline outbox.
  $effect(() => {
    const id = viewerId;
    untrack(() => setSyncUser(id));
  });

  $effect(() => {
    const base = `/api/projects/${encodeURIComponent(projectId)}`;
    let token: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let source: EventSource | null = null;
    let polling = typeof EventSource === 'undefined';
    let sseFailures = 0;
    let inFlight = false;
    let stopped = false;
    let waitingForBlur = false;

    const active = () => !stopped && document.visibilityState === 'visible' && navigator.onLine;

    const refresh = () => {
      if (stopped) return;
      if (isEditing()) {
        if (!waitingForBlur) {
          waitingForBlur = true;
          document.addEventListener('focusout', onFocusOut);
        }
        return;
      }
      // router.refresh(): coalesced with any write's refresh (refresh.svelte.ts).
      void refreshAfterWrite();
    };
    // Focus may be moving to another field; re-check once it has landed.
    function onFocusOut() {
      setTimeout(() => {
        if (isEditing()) return;
        waitingForBlur = false;
        document.removeEventListener('focusout', onFocusOut);
        refresh();
      }, 0);
    }
    const scheduleRefresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refresh, REFRESH_DEBOUNCE_MS);
    };

    // The first token is the baseline; it survives reconnects, so a new stream
    // (whose first event is the current token) reveals what changed meanwhile.
    const onToken = (next: string) => {
      if (token !== null && next !== token) scheduleRefresh();
      token = next;
    };

    // --- SSE --------------------------------------------------------------
    const disconnect = () => {
      source?.close();
      source = null;
    };

    const connect = () => {
      clearTimeout(timer);
      if (source || !active()) return;
      const es = new EventSource(`${base}/stream`);
      source = es;
      es.addEventListener('token', (event) => {
        sseFailures = 0;
        try {
          onToken((JSON.parse((event as MessageEvent<string>).data) as { token: string }).token);
        } catch {
          // Malformed frame — the next one carries the token again.
        }
      });
      // Planned close (function time limit): reconnect right away.
      es.addEventListener('end', () => {
        disconnect();
        timer = setTimeout(connect, SSE_RECONNECT_MS);
      });
      // Removed from the project.
      es.addEventListener('gone', () => {
        stopped = true;
        disconnect();
      });
      es.onerror = () => {
        if (source !== es) return;
        disconnect();
        sseFailures += 1;
        // Streaming doesn't work here (proxy, 401/404, …): poll instead, which
        // also sees status codes and stops for good on 401/403/404.
        if (sseFailures >= SSE_MAX_FAILURES) {
          polling = true;
          void poll();
          return;
        }
        timer = setTimeout(connect, Math.min(SSE_BACKOFF_MS * 2 ** (sseFailures - 1), SSE_BACKOFF_MAX_MS));
      };
    };

    // --- Polling fallback --------------------------------------------
    const poll = async () => {
      clearTimeout(timer);
      if (inFlight || !active()) return;
      inFlight = true;
      let delay = POLL_MS;
      try {
        const res = await fetch(`${base}/changes`, { cache: 'no-store' });
        if (stopStatus(res.status)) {
          stopped = true;
          return;
        }
        if (res.ok) onToken(((await res.json()) as { token: string }).token);
        else delay = POLL_BACKOFF_MS;
      } catch {
        delay = POLL_BACKOFF_MS;
      } finally {
        inFlight = false;
      }
      if (!stopped) timer = setTimeout(() => void poll(), delay);
    };

    // Hidden or offline: pause (close the stream); resumed by the listeners.
    const wake = () => {
      if (!active()) {
        clearTimeout(timer);
        disconnect();
        return;
      }
      if (polling) void poll();
      else connect();
    };

    // Another tab of this project just saved something.
    const stopCrossTab = untrack(() => onProjectChanged(projectId, scheduleRefresh));
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);
    window.addEventListener('offline', wake);
    untrack(wake);

    return () => {
      stopped = true;
      disconnect();
      clearTimeout(timer);
      clearTimeout(refreshTimer);
      stopCrossTab();
      document.removeEventListener('visibilitychange', wake);
      document.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('focus', wake);
      window.removeEventListener('online', wake);
      window.removeEventListener('offline', wake);
    };
  });
</script>

<SyncStatus userId={viewerId} />
