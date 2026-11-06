// Whether the app's first hydration is over (client only; false during SSR).
//
// A store uses the server value only while hydrating; a
// component mounted later (client-side navigation) read the browser value on
// its first render. Components that must render the server value during
// hydration start from `isAppHydrated()` and call `markAppHydrated()` from an
// $effect; the root layout marks it too, so a page that has none still counts.
//
//   let hydrated = $state(isAppHydrated());
//   $effect(() => { hydrated = true; markAppHydrated(); });

let hydrated = false;

export function isAppHydrated(): boolean {
  return hydrated;
}

/** Call from an $effect (effects never run on the server). */
export function markAppHydrated(): void {
  hydrated = true;
}
