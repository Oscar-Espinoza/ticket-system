'use client';

// Sidebar building blocks shared by the shell and its slot owners (favorites,
// workspaces), so every row has the same density, focus ring and active logic.

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

export const sidebarRowClass = cn(
  'flex h-7 items-center gap-2 rounded-md px-2 text-sm outline-none',
  'transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
  '[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground',
);
const rowIdle = 'text-sidebar-foreground hover:bg-sidebar-accent/60';
const rowActive =
  'bg-sidebar-accent font-medium text-sidebar-accent-foreground [&_svg]:text-sidebar-accent-foreground';

export function isActivePath(pathname: string, href: string, exact = false) {
  if (pathname === href) return true;
  return !exact && pathname.startsWith(`${href}/`);
}

export interface SidebarLinkProps {
  href: string;
  label: string;
  icon?: ReactNode;
  /** Right-aligned extra (count badge, shortcut hint). */
  trailing?: ReactNode;
  /** Active only on the exact path, not on sub-routes. */
  exact?: boolean;
  /** Override the pathname-derived active state. */
  active?: boolean;
  indent?: boolean;
}

export function SidebarLink({
  href,
  label,
  icon,
  trailing,
  exact,
  active,
  indent,
}: SidebarLinkProps) {
  const pathname = usePathname();
  const isActive = active ?? isActivePath(pathname, href, exact);
  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(sidebarRowClass, indent && 'pl-7', isActive ? rowActive : rowIdle)}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </Link>
  );
}

export function SidebarSection({
  title,
  action,
  children,
}: {
  /** Section heading; pass a Link to make it navigable. */
  title: ReactNode;
  /** Small control on the right of the heading (e.g. an add button). */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-4">
      <div className="mb-0.5 flex h-6 items-center justify-between px-2 text-xs font-medium text-muted-foreground">
        {title}
        {action}
      </div>
      <div className="flex flex-col gap-px">{children}</div>
    </section>
  );
}
