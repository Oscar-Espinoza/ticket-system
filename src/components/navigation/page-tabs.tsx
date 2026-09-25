// URL-driven tab bar (links, not in-page panels) styled like the project tabs,
// so server pages can switch data by search param. Server-safe.

import Link from 'next/link';

import { cn } from '@/lib/utils';

export function PageTabs({
  tabs,
  current,
  label,
}: {
  tabs: { id: string; label: string; href: string; count?: number }[];
  current: string;
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      className="mb-4 flex items-center gap-1 overflow-x-auto border-b border-border"
    >
      {tabs.map((tab) => {
        const active = tab.id === current;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-2 py-2 text-sm outline-none transition-colors',
              'focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'border-foreground font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="text-xs tabular-nums text-muted-foreground">{tab.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
