<!--
  Unread count at the end of the sidebar Inbox link.
  The dashboard layout load streams the count (an un-awaited promise), so the
  query never holds up the shell; the client pill then keeps itself fresh.
  The server query
  (countUnreadNotifications, errors → 0) lives in app-shell.server.ts.
-->
<script module lang="ts">
  export interface InboxBadgeProps {
    /** Unread count resolved server-side for the session user (streamed). */
    count: Promise<number> | number;
  }
</script>

<script lang="ts">
  import InboxBadgeCount from '@/lib/components/inbox/inbox-badge-count.svelte';

  let { count }: InboxBadgeProps = $props();

  // Last resolved streamed count. refreshAll() re-runs the dashboard layout
  // load after writes and hands us a new promise; React's router.refresh() ran
  // as a transition and kept the revealed badge, so keep showing (and keep
  // mounted) the pill with the previous count until the new one arrives.
  let resolved = $state<number | null>(null);

  $effect(() => {
    const value = count;
    if (typeof value === 'number') {
      resolved = value;
      return;
    }
    let live = true;
    value.then(
      (n) => {
        if (live) resolved = n;
      },
      () => {
        // The server already maps query errors to 0; a failed stream keeps the last count.
      },
    );
    return () => {
      live = false;
    };
  });

  const initial = $derived(typeof count === 'number' ? count : resolved);
</script>

<!-- Suspense fallback={null}: nothing until the first count arrives. -->
{#if initial !== null}
  <InboxBadgeCount {initial} />
{/if}
