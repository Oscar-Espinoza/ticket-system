'use client';

// Registers public/sw.js (offline shell + asset cache). Production only, so dev
// never serves stale bundles — add ?sw=1 to try it in dev, ?sw=0 to unregister.

import { useEffect } from 'react';

export function RegisterServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const flag = new URLSearchParams(window.location.search).get('sw');
    if (flag === '0') {
      void navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())));
      return;
    }
    if (process.env.NODE_ENV !== 'production' && flag !== '1') return;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch((err) => console.warn('[sw] registration failed', err));
  }, []);
  return null;
}
