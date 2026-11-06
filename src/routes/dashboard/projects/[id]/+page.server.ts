// Project issues page. The project layout already authorized the viewer;
// getProjectIssues is membership-gated in SQL too.

import { VIEW_COOKIE } from '@/lib/issue-model';
import { requireUser } from '@/lib/session';
import { getProjectIssues } from '@/lib/tickets';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, cookies }) => {
  const user = await requireUser();

  // All active issues load once, so view and filter changes are purely
  // client-side afterwards.
  const issues = await getProjectIssues(params.id, user.id);

  return { issues, defaultView: cookies.get(VIEW_COOKIE) };
};
