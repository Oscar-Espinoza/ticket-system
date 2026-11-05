// Project issues page. The project layout already authorized the viewer and
// provides project data; getProjectIssues is membership-gated in SQL too.
// (port of src/app/dashboard/projects/[id]/page.tsx)

import { redirect } from '@sveltejs/kit';

import { VIEW_COOKIE } from '@/lib/issue-model';
import { getSession } from '@/lib/session';
import { getProjectIssues } from '@/lib/tickets';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, cookies }) => {
  const session = await getSession();
  if (!session?.user) redirect(303, '/login');

  // All active issues load once, so view and filter changes are purely
  // client-side afterwards.
  const issues = await getProjectIssues(params.id, session.user.id);

  return { issues, defaultView: cookies.get(VIEW_COOKIE) };
};
