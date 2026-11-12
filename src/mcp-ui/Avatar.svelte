<script lang="ts">
  import type { UserRef } from '@/lib/server/mcp/contracts';
  import { initials } from './lib/model';

  let { user, size = 20 }: { user: UserRef | null; size?: number } = $props();

  let failed = $state(false);
  // A stable hue per person, dark enough for white initials in both themes.
  const hue = $derived.by(() => {
    let h = 0;
    for (const ch of user?.id ?? '') h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
  });
  const fontSize = $derived(Math.max(8, Math.round(size * 0.42)));
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
{:else if user.image && !failed}
  <img
    src={user.image}
    alt=""
    title={user.name}
    width={size}
    height={size}
    class="shrink-0 rounded-full object-cover"
    style:width="{size}px"
    style:height="{size}px"
    referrerpolicy="no-referrer"
    onerror={() => (failed = true)}
  />
{:else}
  <span
    class="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none"
    style:width="{size}px"
    style:height="{size}px"
    style:font-size="{fontSize}px"
    style:background="hsl({hue} 45% 38%)"
    title={user.name}
    aria-hidden="true">{initials(user.name)}</span
  >
{/if}
