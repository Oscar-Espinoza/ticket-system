<script lang="ts">
  import type { UserRef } from '@/lib/server/mcp/contracts';
  import { initials } from './lib/model';

  let { user, size = 20 }: { user: UserRef | null; size?: number } = $props();

  // A stable hue per person, dark enough for white initials in both themes.
  const hue = $derived.by(() => {
    let h = 0;
    for (const ch of user?.id ?? '') h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
  });
  // Never under 11 px: two letters stay legible, so the circle grows with the text instead.
  const fontSize = $derived(Math.max(11, Math.round(size * 0.45)));
  const box = $derived(Math.max(size, 22));
</script>

{#if !user}
  <span
    class="inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-line2 text-fg3"
    style:width="{size}px"
    style:height="{size}px"
    role="img"
    aria-label="Unassigned"
  >
    <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M8 8a2.7 2.7 0 1 0 0-5.4A2.7 2.7 0 0 0 8 8zM2.8 13.5c.5-2.4 2.5-3.7 5.2-3.7s4.7 1.3 5.2 3.7" /></svg>
  </span>
{:else}
  <span
    class="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none"
    style:width="{box}px"
    style:height="{box}px"
    style:font-size="{fontSize}px"
    style:background="hsl({hue} 45% 38%)"
    title={user.name}
    aria-hidden="true">{initials(user.name)}</span
  >
{/if}
