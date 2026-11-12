<script lang="ts">
  import { PRIORITY_LABEL } from './lib/model';

  let { priority, size = 16, label = true }: { priority: string; size?: number; label?: boolean } = $props();

  // Three signal bars (low → high); urgent is a filled square with "!".
  const filled = $derived(({ low: 1, medium: 2, high: 3 } as Record<string, number>)[priority] ?? 0);
  const name = $derived(PRIORITY_LABEL[priority as keyof typeof PRIORITY_LABEL] ?? priority);
</script>

<svg width={size} height={size} viewBox="0 0 16 16" role={label ? 'img' : undefined} aria-label={label ? `Priority: ${name}` : undefined} aria-hidden={label ? undefined : 'true'} class="shrink-0">
  {#if priority === 'urgent'}
    <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="#e5484d" />
    <path d="M8 4.6v4.2M8 10.9v.1" stroke="#fff" stroke-width="1.7" stroke-linecap="round" />
  {:else if priority === 'none'}
    <path d="M3 8h2.4M6.8 8h2.4M10.6 8H13" stroke="currentColor" class="text-fg3" stroke-width="1.5" stroke-linecap="round" />
  {:else}
    {#each [0, 1, 2] as i (i)}
      <rect x={2.5 + i * 4} y={9.5 - i * 3} width="3" height={4 + i * 3} rx="1" fill="currentColor" class={i < filled ? 'text-fg' : 'text-line2'} />
    {/each}
  {/if}
</svg>
