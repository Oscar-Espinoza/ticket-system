<script lang="ts">
  import { safeColor } from './lib/model';

  let { type, color, size = 14 }: { type: string; color: string; size?: number } = $props();
  const c = $derived(safeColor(color));
</script>

<svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden="true" class="shrink-0">
  {#if type === 'completed'}
    <circle cx="7" cy="7" r="6" fill={c} />
    <path d="m4.3 7.2 1.9 1.9 3.5-3.9" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
  {:else if type === 'canceled'}
    <circle cx="7" cy="7" r="6" fill={c} />
    <path d="m4.9 4.9 4.2 4.2M9.1 4.9 4.9 9.1" stroke="#fff" stroke-width="1.5" stroke-linecap="round" />
  {:else if type === 'started'}
    <circle cx="7" cy="7" r="5.9" stroke={c} stroke-width="1.6" />
    <path d="M7 3.2a3.8 3.8 0 0 1 0 7.6z" fill={c} />
  {:else if type === 'backlog' || type === 'triage'}
    <circle cx="7" cy="7" r="5.9" stroke={c} stroke-width="1.6" stroke-dasharray="2.2 2.1" />
  {:else}
    <circle cx="7" cy="7" r="5.9" stroke={c} stroke-width="1.6" />
  {/if}
</svg>
