<!-- URL-driven tab bar (links, not in-page panels) styled like the project tabs,
     so server pages can switch data by search param. Port of src/components/navigation/page-tabs.tsx. -->
<script lang="ts">
  import { cn } from '@/lib/utils';

  let {
    tabs,
    current,
    label,
  }: {
    tabs: { id: string; label: string; href: string; count?: number }[];
    current: string;
    label: string;
  } = $props();
</script>

<nav aria-label={label} class="mb-4 flex items-center gap-1 overflow-x-auto border-b border-border">
  {#each tabs as tab (tab.id)}
    {@const active = tab.id === current}
    <a
      href={tab.href}
      aria-current={active ? 'page' : undefined}
      class={cn(
        '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-2 py-2 text-sm outline-none transition-colors',
        'focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-foreground font-medium text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {tab.label}
      {#if tab.count !== undefined}
        <span class="text-xs tabular-nums text-muted-foreground">{tab.count}</span>
      {/if}
    </a>
  {/each}
</nav>
