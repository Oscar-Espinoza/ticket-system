// A minute-resolution clock for countdowns: stable values between ticks and
// null on the server (the value depends on the viewer's clock, so it renders
// after hydration instead of mismatching).
//
// Usage:
//   const now = useMinuteNow();   now.current: epoch ms rounded down to the minute,
//                                 or null during SSR / the first hydration.
// Call during component init (it creates an $effect). A component mounted after
// the app hydrated (client navigation) reads the clock on its first render, as
// React's useSyncExternalStore did.

import { createSubscriber } from 'svelte/reactivity';

import { isAppHydrated, markAppHydrated } from '@/lib/svelte/hydration';

const trackTicks = createSubscriber((update) => {
  const id = window.setInterval(update, 15_000);
  return () => window.clearInterval(id);
});

const snapshot = () => Math.floor(Date.now() / 60_000) * 60_000;

/** Epoch ms rounded down to the minute, or null during SSR / hydration. Read `.current`. */
export function useMinuteNow(): { readonly current: number | null } {
  let hydrated = $state(isAppHydrated());
  $effect(() => {
    hydrated = true;
    markAppHydrated();
  });
  return {
    get current() {
      if (!hydrated) return null;
      trackTicks();
      return snapshot();
    },
  };
}
