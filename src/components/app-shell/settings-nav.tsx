'use client';

// Left-hand navigation for settings areas (account and project settings).
// Stacks above the content as a scrollable row on narrow screens.

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';
import { isActivePath } from './sidebar-nav';

export interface SettingsNavItem {
  href: string;
  label: string;
}

export function SettingsNav({
  label,
  items,
}: {
  /** Accessible name for the nav landmark, also shown as its heading. */
  label: string;
  items: SettingsNavItem[];
}) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="shrink-0 md:w-48">
      <p className="mb-1 hidden px-2 text-xs font-medium text-muted-foreground md:block">
        {label}
      </p>
      <ul className="flex gap-px overflow-x-auto md:flex-col">
        {items.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-7 items-center rounded-md px-2 text-sm outline-none transition-colors',
                  'focus-visible:ring-3 focus-visible:ring-ring/50',
                  active
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Two-column settings frame: nav on the left, a readable column of content. */
export function SettingsFrame({
  nav,
  children,
}: {
  nav: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 md:flex-row md:gap-10">
      {nav}
      <div className="min-w-0 max-w-2xl flex-1">{children}</div>
    </div>
  );
}
