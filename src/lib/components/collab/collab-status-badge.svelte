<!-- Nothing while synced; otherwise a quiet "Connecting…" / "Offline" note. -->
<script lang="ts">
  import { m } from '@/lib/i18n';
  import CloudOff from '@lucide/svelte/icons/cloud-off';
  import Loader2 from '@lucide/svelte/icons/loader-circle';

  import type { CollabSnapshot } from '@/lib/collab/provider';
  import { cn } from '@/lib/utils';

  let { snapshot, class: className }: { snapshot: CollabSnapshot; class?: string } = $props();

  const text = $derived(
    snapshot.status === 'connecting'
      ? m.editor_collab_connecting()
      : snapshot.status === 'offline'
        ? m.editor_collab_offline()
        : m.editor_collab_unavailable(),
  );
</script>

{#if snapshot.status !== 'synced'}
  <span
    role="status"
    class={cn('flex items-center gap-1 text-xs text-muted-foreground', className)}
    title={snapshot.status === 'offline' ? m.editor_collab_offline_tip() : undefined}
  >
    {#if snapshot.status === 'connecting'}
      <Loader2 class="size-3.5 animate-spin" aria-hidden="true" />
    {:else}
      <CloudOff class="size-3.5" aria-hidden="true" />
    {/if}
    {text}
  </span>
{/if}
