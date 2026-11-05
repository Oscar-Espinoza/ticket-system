// Row classes and active-path logic behind sidebar-nav.ts (kept separate so the
// components can import them without a cycle through the barrel).

import { cn } from '@/lib/utils';

export const sidebarRowClass = cn(
  'flex h-7 items-center gap-2 rounded-md px-2 text-sm outline-none',
  'transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
  '[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground',
);
export const rowIdle = 'text-sidebar-foreground hover:bg-sidebar-accent/60';
export const rowActive =
  'bg-sidebar-accent font-medium text-sidebar-accent-foreground [&_svg]:text-sidebar-accent-foreground';

export function isActivePath(pathname: string, href: string, exact = false) {
  if (pathname === href) return true;
  return !exact && pathname.startsWith(`${href}/`);
}
