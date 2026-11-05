// Code hosts connected to a project (GitHub, GitLab, Bitbucket), fetched once
// per project per few minutes and shared by every issue opened in the session.
//
// Svelte port: `useVcsConnections(projectId)` takes the id or a getter (use a
// getter when the id can change) and returns `{ readonly current }` — `null`
// while loading or when the lookup failed. Call during component init.

import { getVcsConnections, type VcsConnection } from '@/lib/actions/developer';

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; promise: Promise<VcsConnection[] | null> }>();

function load(projectId: string): Promise<VcsConnection[] | null> {
  const hit = cache.get(projectId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = getVcsConnections(projectId)
    .then((result) => (result.ok ? result.connections : null))
    .catch(() => {
      cache.delete(projectId);
      return null;
    });
  cache.set(projectId, { at: Date.now(), promise });
  return promise;
}

/** null while loading (or when the lookup failed). */
export function useVcsConnections(projectId: string | (() => string)): {
  readonly current: VcsConnection[] | null;
} {
  const id = () => (typeof projectId === 'function' ? projectId() : projectId);
  let state = $state.raw<{ projectId: string; value: VcsConnection[] | null } | null>(null);

  $effect(() => {
    const requested = id();
    let cancelled = false;
    void load(requested).then((value) => {
      if (!cancelled) state = { projectId: requested, value };
    });
    return () => {
      cancelled = true;
    };
  });

  return {
    get current() {
      return state?.projectId === id() ? state.value : null;
    },
  };
}
