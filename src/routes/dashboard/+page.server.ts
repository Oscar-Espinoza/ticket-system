// Dashboard home: a time-of-day greeting, a GitHub-connected status badge
// derived from the account table at render time (never from the session), then
// the project list.
//
// isGitHubConnected() selects only account.id (never the token), so
// connection status can never leak the GitHub access token.

import { isGitHubConnected } from '@/lib/github-token';
import { getProjectsForUser } from '@/lib/components/project-list.server';
import { requireUser } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const user = await requireUser();

  // The GitHub check and the (memoized) project query run in parallel.
  const [githubConnected, projects] = await Promise.all([
    isGitHubConnected(user.id),
    getProjectsForUser(user.id),
  ]);

  return { name: user.name, githubConnected, projects };
};
