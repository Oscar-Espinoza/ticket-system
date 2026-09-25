// Triage page. The project layout already checked membership; getProjectIssues
// is membership-gated in SQL too (and shared with the duplicate search).

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Inbox } from 'lucide-react';

import { getSession } from '@/lib/session';
import { getProjectData } from '@/lib/project-data';
import { getProjectIssues } from '@/lib/tickets';
import { roleAllows } from '@/lib/roles';
import { FeatureOffState } from '@/components/cycles/feature-off';
import { TriageView } from '@/components/triage/triage-view';

export const metadata: Metadata = { title: 'Triage' };

export default async function TriagePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');
  const [data, issues] = await Promise.all([
    getProjectData(id, session.user.id),
    getProjectIssues(id, session.user.id),
  ]);
  if (!data) notFound();

  // getProjectIssues is newest first already.
  const triage = issues.filter((issue) => issue.state.type === 'triage');
  if (!data.project.triageEnabled && triage.length === 0) {
    return (
      <FeatureOffState
        projectId={id}
        icon={<Inbox />}
        title="Triage is off"
        description="Route new issues from the intake form, the API and people outside the project through a review queue before they reach the backlog."
        canEnable={roleAllows(data.project.role, 'admin')}
      />
    );
  }

  return <TriageView issues={triage} candidates={issues} />;
}
