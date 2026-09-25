'use client';

// j / k focus the next / previous NavIssueRow in a `[data-nav-list]` container;
// Enter then follows the focused link natively. Mount once per page.

import { useEffect, type ReactNode } from 'react';

import { registerHotkeys } from '@/lib/hotkeys';

function move(step: 1 | -1) {
  const rows = [
    ...document.querySelectorAll<HTMLElement>('[data-nav-list] [data-nav-row]'),
  ];
  if (rows.length === 0) return;
  const index = rows.findIndex((row) => row === document.activeElement);
  const next = index === -1 ? (step === 1 ? 0 : rows.length - 1) : index + step;
  const row = rows[Math.max(0, Math.min(rows.length - 1, next))];
  row.focus();
  row.scrollIntoView({ block: 'nearest' });
}

export function NavList({ children, className }: { children: ReactNode; className?: string }) {
  useEffect(
    () =>
      registerHotkeys([
        { key: 'j', scope: 'Lists', description: 'Next issue', handler: () => move(1) },
        { key: 'k', scope: 'Lists', description: 'Previous issue', handler: () => move(-1) },
      ]),
    [],
  );
  return (
    <div data-nav-list className={className}>
      {children}
    </div>
  );
}
