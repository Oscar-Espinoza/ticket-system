// Server half of the transport shared by every generated src/lib/remote/*.remote.ts
// (see scripts/gen-remote-actions.mjs).

import { isRedirect } from '@sveltejs/kit';
import type { Transported } from '@/lib/action-transport';

/** Runs the action; a thrown redirect() travels as data, anything else rethrows. */
export async function run<T>(fn: () => T): Promise<Transported<Awaited<T>>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    if (isRedirect(err)) return { ok: false, redirect: err.location };
    throw err;
  }
}

/** Rebuilds the FormData a client wrapper sent as `entries` (repeated keys keep their order). */
export function formData(entries: [string, string][]): FormData {
  const fd = new FormData();
  for (const [k, v] of entries) fd.append(k, v);
  return fd;
}
