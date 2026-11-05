<!--
  "N changes pending sync" pill while the offline outbox holds this viewer's
  ops. Bottom-centre like B12's offline banner; offline it sits just above it.
  Port of src/components/sync/sync-status.tsx.
-->
<script lang="ts">
  import CloudOffIcon from '@lucide/svelte/icons/cloud-off';
  import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
  import { online as onlineState } from 'svelte/reactivity/window';

  import { flush, setSyncUser, useOutboxItems } from '@/lib/svelte/outbox.svelte';
  import { cn } from '@/lib/utils';

  let { userId }: { userId: string } = $props();

  // useSyncExternalStore(…, () => navigator.onLine, () => true).
  const online = $derived(onlineState.current ?? true);
  const outbox = useOutboxItems();
  const pending = $derived(outbox.current.filter((item) => item.userId === userId));
  const count = $derived(`${pending.length} ${pending.length === 1 ? 'change' : 'changes'} pending sync`);
  const details = $derived(pending.map((item) => item.label).join('\n'));
</script>

{#if pending.length > 0}
  <div
    role="status"
    class={cn(
      'fixed left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2',
      online ? 'bottom-4' : 'bottom-14',
    )}
  >
    <button
      type="button"
      title={online ? `${details}\n\nClick to retry now` : details}
      disabled={!online}
      onclick={() => {
        setSyncUser(userId);
        void flush();
      }}
      class="flex max-w-full items-center gap-2 rounded-full border border-border bg-popover px-3 py-1 text-xs text-muted-foreground shadow-[var(--shadow-popover)] transition-colors enabled:hover:text-popover-foreground"
    >
      {#if online}
        <RefreshCwIcon class="size-3.5 shrink-0 animate-spin [animation-duration:2s]" aria-hidden="true" />
      {:else}
        <CloudOffIcon class="size-3.5 shrink-0" aria-hidden="true" />
      {/if}
      <span class="truncate">{online ? count : `Offline · ${count}`}</span>
    </button>
  </div>
{/if}
