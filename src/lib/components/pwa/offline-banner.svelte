<!--
  Shown while the browser reports no network. Cached pages still open, and
  issue edits queue in the sync outbox (src/lib/svelte/outbox.svelte.ts) until reconnect.
  Port of src/components/pwa/offline-banner.tsx.
-->
<script lang="ts">
  import WifiOffIcon from '@lucide/svelte/icons/wifi-off';
  import { online } from 'svelte/reactivity/window';

  import { isAppHydrated, markAppHydrated } from '@/lib/svelte/hydration';

  // useSyncExternalStore's server snapshot (online) during SSR and hydration,
  // navigator.onLine from then on.
  let hydrated = $state(isAppHydrated());
  $effect(() => {
    hydrated = true;
    markAppHydrated();
  });
</script>

{#if hydrated && online.current === false}
  <div
    role="status"
    class="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-popover px-3.5 py-1.5 text-xs text-popover-foreground shadow-[var(--shadow-popover)]"
  >
    <WifiOffIcon class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    <span>You're offline — changes are saved on this device and sync when you reconnect.</span>
  </div>
{/if}
