// Per-project cache of cross-project epic options (epics of sibling projects
// in the workspace) for the issue "Epic" picker. Loaded lazily — on picker
// open, or when an issue already points at an epic that isn't local — and
// refetched on the next open once it's a minute old.
//
// Svelte port of src/components/epics/foreign-epics-store.ts:
//   const foreign = useForeignEpics(() => project.id, () => pickerOpen || needsForeign);
//   foreign.current   ForeignEpicOption[] | undefined (undefined until first loaded,
//                     while `enabled` is false and nothing is cached, and during SSR)
// Both arguments accept a plain value or a getter; pass getters to stay reactive.
// Call during component init (it registers an $effect).

import { browser } from '$app/env';
import { createSubscriber } from 'svelte/reactivity';

import { listAvailableEpics } from '@/lib/actions/epics';
import type { ForeignEpicOption } from '@/lib/components/epics/epic-model';

const STALE_MS = 60_000;

const loaded = new Map<string, { at: number; epics: ForeignEpicOption[] }>();
const inflight = new Set<string>();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

const track = createSubscriber((update) => {
  listeners.add(update);
  return () => {
    listeners.delete(update);
  };
});

function fetchEpics(projectId: string) {
  if (inflight.has(projectId)) return;
  inflight.add(projectId);
  listAvailableEpics({ projectId })
    // A failure caches an empty list so the effect doesn't retry in a loop.
    .then((result) => loaded.set(projectId, { at: Date.now(), epics: result.ok ? result.epics : [] }))
    .catch(() => loaded.set(projectId, { at: Date.now(), epics: [] }))
    .finally(() => {
      inflight.delete(projectId);
      emit();
    });
}

type MaybeGetter<T> = T | (() => T);
const read = <T>(value: MaybeGetter<T>): T =>
  typeof value === 'function' ? (value as () => T)() : value;

/** Cross-project epic options; undefined until first loaded (or while `enabled` is false). */
export function useForeignEpics(
  projectId: MaybeGetter<string>,
  enabled: MaybeGetter<boolean>,
): { readonly current: ForeignEpicOption[] | undefined } {
  $effect(() => {
    const id = read(projectId);
    const on = read(enabled);
    track();
    const entry = loaded.get(id);
    if (on && (!entry || Date.now() - entry.at > STALE_MS)) fetchEpics(id);
  });
  return {
    get current() {
      // Server snapshot: nothing (module state is shared across requests there).
      if (!browser) return undefined;
      track();
      return loaded.get(read(projectId))?.epics;
    },
  };
}
