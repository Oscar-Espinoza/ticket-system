/**
 * A label map that resolves in the current interface language on every read.
 * A module-level `{ a: m.x() }` would freeze the first language it was loaded
 * in (on the server: for every later request), so keep the message functions
 * and read through getters.
 */
export function lazyLabels<K extends string>(labels: Record<K, () => string>): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const key of Object.keys(labels) as K[]) {
    Object.defineProperty(out, key, { get: labels[key], enumerable: true });
  }
  return out;
}
