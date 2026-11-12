<script lang="ts">
  import { host } from './lib/app.svelte';
  import Icon from './Icon.svelte';

  // "Open in Ticket System": the host opens the URL in the user's browser
  // (ui/open-link); the iframe itself never navigates.
  let { url, label = 'Open in Ticket System', compact = false }: { url: string; label?: string; compact?: boolean } = $props();

  let refused = $state(false);

  async function open() {
    refused = !(await host.openLink(url));
  }
</script>

<span class="inline-flex flex-col items-end gap-1">
  <button
    type="button"
    onclick={open}
    class="inline-flex min-h-8 min-w-8 items-center justify-center gap-1 rounded-viewsm border border-line px-2 text-fg2 hover:bg-bg2 hover:text-fg"
    aria-label={compact ? label : undefined}
    title={label}
  >
    <Icon name="external" size={13} />
    {#if !compact}<span>{label}</span>{/if}
  </button>
  {#if refused}
    <span class="max-w-64 text-[0.85em] break-all text-fg2" role="status">Your assistant can't open links from here. Address: <span class="select-all">{url}</span></span>
  {/if}
</span>
