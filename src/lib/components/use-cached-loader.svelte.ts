// A per-project promise cache with a short TTL, plus the hook that reads it.
// Used for lookups every issue opened in a session would otherwise repeat
// (the viewer's GitHub status, the project's connected code hosts). Stale
// after a few minutes so connecting a host in another tab shows up without a
// reload.

const TTL_MS = 5 * 60 * 1000;

/** Fetches once per key per TTL; a failed lookup is dropped from the cache and resolves to null. */
export function createCachedLoader<T>(fetch: (key: string) => Promise<T | null>) {
  const cache = new Map<string, { at: number; promise: Promise<T | null> }>();
  return (key: string): Promise<T | null> => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
    const promise = fetch(key).catch(() => {
      cache.delete(key);
      return null;
    });
    cache.set(key, { at: Date.now(), promise });
    return promise;
  };
}

/**
 * `{ readonly current }` — null while loading or when the lookup failed. Takes
 * the key or a getter (use a getter when it can change). Call during component init.
 */
export function useLoaded<T>(
  key: string | (() => string),
  load: (key: string) => Promise<T | null>,
): { readonly current: T | null } {
  const keyNow = () => (typeof key === 'function' ? key() : key);
  let loaded = $state.raw<{ key: string; value: T | null } | null>(null);

  $effect(() => {
    const requested = keyNow();
    let cancelled = false;
    void load(requested).then((value) => {
      if (!cancelled) loaded = { key: requested, value };
    });
    return () => {
      cancelled = true;
    };
  });

  return {
    get current() {
      return loaded?.key === keyNow() ? loaded.value : null;
    },
  };
}
