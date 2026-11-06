// Client half of the transport shared by every generated src/lib/actions/*.ts
// (see scripts/gen-remote-actions.mjs).

import { goto } from '$app/navigation';
import type { Transported } from '@/lib/action-transport';
import { refreshAfterWrite } from '@/lib/svelte/refresh.svelte';

/** Navigates when the action redirected; otherwise refreshes (if the action marks itself with refreshesData()) and returns the value. */
export async function settle<T>(out: Transported<T>, refresh: boolean): Promise<T> {
  if (!out.ok) {
    await goto(out.redirect, { refreshAll: true });
    return undefined as T;
  }
  if (refresh) await refreshAfterWrite();
  return out.value;
}

/** FormData as sendable entries; files are rejected (upload via /api/uploads). */
export function entries(fd: FormData): [string, string][] {
  const out: [string, string][] = [];
  fd.forEach((v, k) => {
    if (typeof v !== 'string') throw new Error('File fields are not supported by action wrappers; upload via /api/uploads.');
    out.push([k, v]);
  });
  return out;
}
