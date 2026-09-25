// Minimal DataLoader: keys requested in the same tick are fetched with one
// batch call, and every key is cached for the rest of the request. Loaders are
// created per request (see context.ts), so the cache never outlives the
// caller's permissions.

type Pending<K, V> = { key: K; resolve: (value: V) => void; reject: (err: unknown) => void };

export interface Loader<K, V> {
  load(key: K): Promise<V>;
  loadMany(keys: readonly K[]): Promise<V[]>;
  prime(key: K, value: V): void;
}

export function createLoader<K, V>(
  batch: (keys: K[]) => Promise<Map<K, V>>,
  missing: V,
): Loader<K, V> {
  const cache = new Map<K, Promise<V>>();
  let queue: Pending<K, V>[] = [];

  async function flush() {
    const pending = queue;
    queue = [];
    try {
      const found = await batch([...new Set(pending.map((p) => p.key))]);
      for (const p of pending) p.resolve(found.has(p.key) ? (found.get(p.key) as V) : missing);
    } catch (err) {
      for (const p of pending) {
        cache.delete(p.key);
        p.reject(err);
      }
    }
  }

  function load(key: K): Promise<V> {
    const cached = cache.get(key);
    if (cached) return cached;
    const promise = new Promise<V>((resolve, reject) => {
      queue.push({ key, resolve, reject });
      // Wait for the current promise jobs to settle (like DataLoader) so sibling
      // resolvers that await first still join the same batch.
      if (queue.length === 1) void Promise.resolve().then(() => process.nextTick(flush));
    });
    cache.set(key, promise);
    return promise;
  }

  return {
    load,
    loadMany: (keys) => Promise.all(keys.map(load)),
    prime(key, value) {
      if (!cache.has(key)) cache.set(key, Promise.resolve(value));
    },
  };
}

/** Group rows into a Map of arrays keyed by `keyOf` (for one-to-many loaders). */
export function groupBy<K, T>(rows: T[], keyOf: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return map;
}
