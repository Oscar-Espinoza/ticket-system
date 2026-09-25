'use client';

// A minute-resolution clock for countdowns: stable snapshots between ticks and
// null on the server (the value depends on the viewer's clock, so it renders
// after hydration instead of mismatching).

import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  const id = window.setInterval(onChange, 15_000);
  return () => window.clearInterval(id);
}
const snapshot = () => Math.floor(Date.now() / 60_000) * 60_000;
const serverSnapshot = () => null;

/** Epoch ms rounded down to the minute, or null during SSR / hydration. */
export function useMinuteNow(): number | null {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
