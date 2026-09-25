'use client';

// Per-project cache of cross-project epic options (epics of sibling projects
// in the workspace) for the issue "Epic" picker. Loaded lazily — on picker
// open, or when an issue already points at an epic that isn't local — and
// refetched on the next open once it's a minute old.

import { useEffect, useSyncExternalStore } from 'react';

import { listAvailableEpics } from '@/app/actions/epics';
import type { ForeignEpicOption } from './epic-model';

const STALE_MS = 60_000;

const loaded = new Map<string, { at: number; epics: ForeignEpicOption[] }>();
const inflight = new Set<string>();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

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

/** Cross-project epic options; undefined until first loaded (or while `enabled` is false). */
export function useForeignEpics(projectId: string, enabled: boolean): ForeignEpicOption[] | undefined {
  const entry = useSyncExternalStore(
    subscribe,
    () => loaded.get(projectId),
    () => undefined,
  );
  useEffect(() => {
    if (enabled && (!entry || Date.now() - entry.at > STALE_MS)) fetchEpics(projectId);
  }, [enabled, entry, projectId]);
  return entry?.epics;
}
