// Minimal authenticated dashboard (D-09) — port of src/app/dashboard/page.tsx.
//
// Shows: a time-of-day greeting and a GitHub-connected status badge derived
// from the account table at render time (D-05 — never from the session JWT),
// then the project list.
//
// isGitHubConnected() selects only account.id (never the token), so
// connection status can never leak the GitHub access token (D-05).

import { isGitHubConnected } from '@/lib/github-token';
import { getProjectsForUser } from '@/lib/components/project-list.server';
import { getSession } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  // Layout already guarded this route; session is guaranteed non-null here, but
  // we re-read it (memoized per request) for the user's name.
  const session = await getSession();
  const user = session?.user;

  // The GitHub check and the (memoized) project query run in parallel.
  const [githubConnected, projects] = user
    ? await Promise.all([isGitHubConnected(user.id), getProjectsForUser(user.id)])
    : [false, []];

  return { name: user?.name ?? null, githubConnected, projects };
};
