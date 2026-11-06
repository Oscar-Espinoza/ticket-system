<!--
  NavList: j / k focus the next / previous NavIssueRow in a `[data-nav-list]`
  container; Enter then follows the focused link natively. Mount once per page.
-->
<script module lang="ts">
  function move(step: 1 | -1) {
    const rows = [...document.querySelectorAll<HTMLElement>('[data-nav-list] [data-nav-row]')];
    if (rows.length === 0) return;
    const index = rows.findIndex((row) => row === document.activeElement);
    const next = index === -1 ? (step === 1 ? 0 : rows.length - 1) : index + step;
    const row = rows[Math.max(0, Math.min(rows.length - 1, next))];
    row.focus();
    row.scrollIntoView({ block: 'nearest' });
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';

  import { registerHotkeys } from '@/lib/svelte/hotkeys.svelte';

  let { children, class: className }: { children?: Snippet; class?: string } = $props();

  $effect(() =>
    registerHotkeys([
      { key: 'j', scope: 'Lists', description: 'Next issue', handler: () => move(1) },
      { key: 'k', scope: 'Lists', description: 'Previous issue', handler: () => move(-1) },
    ]),
  );
</script>

<div data-nav-list class={className}>
  {@render children?.()}
</div>
