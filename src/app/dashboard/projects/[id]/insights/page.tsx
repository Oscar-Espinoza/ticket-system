import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { InsightsView } from '@/components/insights/insights-view';
import { getProjectInsights, INSIGHT_RANGES, parseInsightRange } from '@/lib/insights';
import { getProjectData } from '@/lib/project-data';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Insights' };

export default async function InsightsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string; label?: string }>;
}) {
  const [{ id }, query, session] = await Promise.all([params, searchParams, getSession()]);
  if (!session?.user) redirect('/login');
  // Membership-gated and memoized — the layout already loaded it this request.
  const project = await getProjectData(id, session.user.id);
  if (!project) notFound();

  const weeks = parseInsightRange(query.range);
  const labelId = project.labels.some((l) => l.id === query.label) ? query.label! : null;
  const data = await getProjectInsights(id, { weeks, labelId });

  return <InsightsView data={data} weeks={weeks} ranges={INSIGHT_RANGES} labelId={labelId} />;
}
