// The viewer's GitHub status for a project ({ repo, connected, login }). The
// server call hits GitHub's /user, so it is cached per project.

import { getGithubViewer, type GithubViewer } from '@/lib/actions/github';
import { createCachedLoader, useLoaded } from '@/lib/components/use-cached-loader.svelte';

const loadGithubViewer = createCachedLoader<GithubViewer>((projectId) =>
  getGithubViewer(projectId).then((result) => (result.ok ? result : null)),
);

export function useGithubViewer(projectId: string | (() => string)): {
  readonly current: GithubViewer | null;
} {
  return useLoaded(projectId, loadGithubViewer);
}
