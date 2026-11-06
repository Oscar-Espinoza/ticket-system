// Project insights.

import { getProjectInsights } from '@/lib/insights';
import { INSIGHT_RANGES, parseInsightRange } from '@/lib/insights-model';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, parent }) => {
  const { projectData: project } = await parent();

  const weeks = parseInsightRange(url.searchParams.get('range') ?? undefined);
  const label = url.searchParams.get('label') ?? undefined;
  const labelId = project.labels.some((l) => l.id === label) ? label! : null;
  const data = await getProjectInsights(params.id, { weeks, labelId });

  return { data, weeks, ranges: INSIGHT_RANGES, labelId };
};
