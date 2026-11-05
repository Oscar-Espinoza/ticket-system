// Project insights (port of src/app/dashboard/projects/[id]/insights/page.tsx).

import { error, redirect } from '@sveltejs/kit';

import { getProjectInsights, INSIGHT_RANGES, parseInsightRange } from '@/lib/insights';
import { getProjectData } from '@/lib/project-data';
import { getSession } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
  const session = await getSession();
  if (!session?.user) redirect(303, '/login');
  // Membership-gated and memoized — the layout already loaded it this request.
  const project = await getProjectData(params.id, session.user.id);
  if (!project) error(404, 'Not found');

  const weeks = parseInsightRange(url.searchParams.get('range') ?? undefined);
  const label = url.searchParams.get('label') ?? undefined;
  const labelId = project.labels.some((l) => l.id === label) ? label! : null;
  const data = await getProjectInsights(params.id, { weeks, labelId });

  return { data, weeks, ranges: INSIGHT_RANGES, labelId };
};
