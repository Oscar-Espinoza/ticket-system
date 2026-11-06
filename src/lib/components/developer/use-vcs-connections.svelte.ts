// Code hosts connected to a project (GitHub, GitLab, Bitbucket), shared by
// every issue opened in the session.

import { getVcsConnections, type VcsConnection } from '@/lib/actions/developer';
import { createCachedLoader, useLoaded } from '@/lib/components/use-cached-loader.svelte';

const loadVcsConnections = createCachedLoader<VcsConnection[]>((projectId) =>
  getVcsConnections(projectId).then((result) => (result.ok ? result.connections : null)),
);

export function useVcsConnections(projectId: string | (() => string)): {
  readonly current: VcsConnection[] | null;
} {
  return useLoaded(projectId, loadVcsConnections);
}
