<!--
  Left-hand navigation for settings areas (account and project settings).
  Stacks above the content as a scrollable row on narrow screens.
  Port of SettingsNav in src/components/app-shell/settings-nav.tsx.
-->
<script module lang="ts">
  export interface SettingsNavItem {
    href: string;
    label: string;
  }
</script>

<script lang="ts">
  import { page } from '$app/state';

  import { cn } from '@/lib/utils';
  import { isActivePath } from './sidebar-row';

  let {
    label,
    items,
  }: {
    /** Accessible name for the nav landmark, also shown as its heading. */
    label: string;
    items: SettingsNavItem[];
  } = $props();
</script>

<nav aria-label={label} class="shrink-0 md:w-48">
  <p class="mb-1 hidden px-2 text-xs font-medium text-muted-foreground md:block">
    {label}
  </p>
  <ul class="flex gap-px overflow-x-auto md:flex-col">
    {#each items as item (item.href)}
      {@const active = isActivePath(page.url.pathname, item.href)}
      <li class="shrink-0">
        <a
          href={item.href}
          aria-current={active ? 'page' : undefined}
          class={cn(
            'flex h-7 items-center rounded-md px-2 text-sm outline-none transition-colors',
            'focus-visible:ring-3 focus-visible:ring-ring/50',
            active
              ? 'bg-accent font-medium text-accent-foreground'
              : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
          )}
        >
          {item.label}
        </a>
      </li>
    {/each}
  </ul>
</nav>
