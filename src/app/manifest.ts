// Web app manifest → installable PWA (the $0 "mobile app"). Colours are the
// dark theme tokens (the app's default theme): --background #08090a.

import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/dashboard',
    name: 'Ticket System',
    short_name: 'Tickets',
    description: 'A Linear-style ticket tracker whose status stays in sync with GitHub work.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#08090a',
    theme_color: '#08090a',
    categories: ['productivity', 'developer'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    shortcuts: [
      { name: 'My issues', url: '/dashboard/my-issues' },
      { name: 'Inbox', url: '/dashboard/inbox' },
    ],
  };
}
