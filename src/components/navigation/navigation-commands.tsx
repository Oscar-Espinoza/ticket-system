'use client';

// Global palette commands owned by navigation (search, my issues tabs, views).

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { registerPaletteCommands } from '@/lib/palette-commands';

export function NavigationCommands() {
  const router = useRouter();

  useEffect(
    () =>
      registerPaletteCommands([
        {
          id: 'search-issues',
          label: 'Search issues…',
          section: 'Navigation',
          keywords: ['find', 'full text', 'comments'],
          run: () => router.push('/dashboard/search'),
        },
        {
          id: 'my-issues-created',
          label: 'Issues I created',
          section: 'Navigation',
          keywords: ['my issues', 'created'],
          run: () => router.push('/dashboard/my-issues?tab=created'),
        },
        {
          id: 'my-issues-subscribed',
          label: 'Issues I’m subscribed to',
          section: 'Navigation',
          keywords: ['my issues', 'subscribed', 'following'],
          run: () => router.push('/dashboard/my-issues?tab=subscribed'),
        },
      ]),
    [router],
  );

  return null;
}
