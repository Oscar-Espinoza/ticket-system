<!-- SidebarLink. -->
<script module lang="ts">
  import type { Snippet } from 'svelte';

  export interface SidebarLinkProps {
    href: string;
    label: string;
    icon?: Snippet;
    /** Right-aligned extra (count badge, shortcut hint). */
    trailing?: Snippet;
    /** Active only on the exact path, not on sub-routes. */
    exact?: boolean;
    /** Override the pathname-derived active state. */
    active?: boolean;
    indent?: boolean;
  }
</script>

<script lang="ts">
  import { page } from '$app/state';

  import { cn } from '@/lib/utils';
  import { isActivePath, rowActive, rowIdle, sidebarRowClass } from './sidebar-row';

  let { href, label, icon, trailing, exact, active, indent }: SidebarLinkProps = $props();

  const isActive = $derived(active ?? isActivePath(page.url.pathname, href, exact));
</script>

<a
  {href}
  aria-current={isActive ? 'page' : undefined}
  class={cn(sidebarRowClass, indent && 'pl-7', isActive ? rowActive : rowIdle)}
>
  {@render icon?.()}
  <span class="min-w-0 flex-1 truncate">{label}</span>
  {@render trailing?.()}
</a>
