'use client';

// Code hosts connected to a project (GitHub, GitLab, Bitbucket), fetched once
// per project per few minutes and shared by every issue opened in the session.

import { useEffect, useState } from 'react';

import { getVcsConnections, type VcsConnection } from '@/app/actions/developer';

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
export function useVcsConnections(projectId: string): VcsConnection[] | null {
  const [state, setState] = useState<{ projectId: string; value: VcsConnection[] | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    load(projectId).then((value) => {
      if (!cancelled) setState({ projectId, value });
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  return state?.projectId === projectId ? state.value : null;
}
