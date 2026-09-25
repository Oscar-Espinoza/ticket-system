'use client';

// The viewer's GitHub status for a project ({ repo, connected, login }), fetched
// once per project and reused by every issue opened in the session (the
// server call hits GitHub's /user). Stale after a few minutes so connecting
// GitHub in another tab shows up without a reload.

import { useEffect, useState } from 'react';

import { getGithubViewer, type GithubViewer } from '@/app/actions/github';

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
export function useGithubViewer(projectId: string): GithubViewer | null {
  const [viewer, setViewer] = useState<{ projectId: string; value: GithubViewer | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadGithubViewer(projectId).then((value) => {
      if (!cancelled) setViewer({ projectId, value });
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  return viewer?.projectId === projectId ? viewer.value : null;
}
