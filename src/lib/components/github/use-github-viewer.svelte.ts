// The viewer's GitHub status for a project ({ repo, connected, login }), fetched
// once per project and reused by every issue opened in the session (the
// server call hits GitHub's /user). Stale after a few minutes so connecting
// GitHub in another tab shows up without a reload.
//
// Svelte port: `useGithubViewer(projectId)` takes the id or a getter (use a
// getter when the id can change) and returns `{ readonly current }` — `null`
// while loading or when the lookup failed. Call during component init.

import { getGithubViewer, type GithubViewer } from '@/lib/actions/github';

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; promise: Promise<GithubViewer | null> }>();

export function loadGithubViewer(projectId: string): Promise<GithubViewer | null> {
  const hit = cache.get(projectId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = getGithubViewer(projectId)
    .then((result) => (result.ok ? result : null))
    .catch(() => {
      cache.delete(projectId);
      return null;
    });
  cache.set(projectId, { at: Date.now(), promise });
  return promise;
}

/** null while loading (or when the lookup failed). */
export function useGithubViewer(projectId: string | (() => string)): {
  readonly current: GithubViewer | null;
} {
  const id = () => (typeof projectId === 'function' ? projectId() : projectId);
  let viewer = $state.raw<{ projectId: string; value: GithubViewer | null } | null>(null);

  $effect(() => {
    const requested = id();
    let cancelled = false;
    void loadGithubViewer(requested).then((value) => {
      if (!cancelled) viewer = { projectId: requested, value };
    });
    return () => {
      cancelled = true;
    };
  });

  return {
    get current() {
      return viewer?.projectId === id() ? viewer.value : null;
    },
  };
}
