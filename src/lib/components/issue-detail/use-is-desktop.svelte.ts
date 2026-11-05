// `useIsDesktop()` from src/components/issue-detail/issue-detail-pane.tsx.
//
// Like React's useSyncExternalStore with a `true` server snapshot: `true` on the
// server and during the app's first hydration, then the live
// `(min-width: 1024px)` match (a component mounted later reads the live value on
// its first render). Call during component init; returns `{ current }`.

import { MediaQuery } from 'svelte/reactivity';

import { isAppHydrated, markAppHydrated } from '@/lib/svelte/hydration';

const DESKTOP_QUERY = '(min-width: 1024px)';

export function useIsDesktop(): { readonly current: boolean } {
  const query = new MediaQuery(DESKTOP_QUERY, true);
  let hydrated = $state(isAppHydrated());
  $effect(() => {
    hydrated = true;
    markAppHydrated();
  });
  return {
    get current() {
      return hydrated ? query.current : true;
    },
  };
}
