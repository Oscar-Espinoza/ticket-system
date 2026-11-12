<script lang="ts">
  import type { Snippet } from 'svelte';

  // A small pill. `tint` (a hex colour) tints the background; the text keeps
  // the theme's foreground so contrast never depends on a user-chosen colour.
  let { tint = null, tone = 'neutral', children }: { tint?: string | null; tone?: 'neutral' | 'danger' | 'warn' | 'ok'; children: Snippet } = $props();
</script>

<span
  class="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border px-2 py-px text-[0.85em] leading-5
    {tint ? 'text-fg' : tone === 'danger' ? 'border-danger/40 text-danger' : tone === 'warn' ? 'border-warn/40 text-warn' : tone === 'ok' ? 'border-ok/40 text-ok' : 'border-line text-fg2'}"
  style:background={tint ? `color-mix(in srgb, ${tint} 16%, transparent)` : undefined}
  style:border-color={tint ? `color-mix(in srgb, ${tint} 45%, transparent)` : undefined}
>
  {@render children()}
</span>
