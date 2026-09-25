// Cycle page: header, progress, burndown, breakdown and the cycle's issues.
// The project layout already checked membership; the cycle is looked up by
// (project id, cycle id) and the issue read is membership-gated in SQL too.

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';

import { tickets } from '@/db/schema';
import { getSession } from '@/lib/session';
import { getProjectData } from '@/lib/project-data';
import { roleAllows } from '@/lib/roles';
import { activeIssue, memberOfIssueProject, queryIssues } from '@/lib/tickets';
import { isClosed } from '@/lib/workflow';
import { VIEW_COOKIE } from '@/lib/issue-model';
import {
  cycleBurndown,
  cycleTotals,
  findNextCycle,
  getCycle,
  loadCycleHistory,
} from '@/lib/cycles';
import { IssuesView } from '@/components/issues/issues-view';
import { BurndownChart } from '@/components/cycles/cycle-charts';
import { CycleBreakdown } from '@/components/cycles/cycle-breakdown';
import { CycleHeader } from '@/components/cycles/cycle-header';
import { CycleProgressBar, CycleStats } from '@/components/cycles/cycle-stats';
import { cycleName, cycleStatus, percent } from '@/components/cycles/cycle-utils';

type Params = Promise<{ id: string; cycleId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const [{ id, cycleId }, session] = await Promise.all([params, getSession()]);
  const data = session?.user ? await getProjectData(id, session.user.id) : null;
  const cycle = data?.cycles.find((c) => c.id === cycleId);
  return { title: cycle ? cycleName(cycle) : 'Cycle' };
}

export default async function CyclePage({ params }: { params: Params }) {
  const [{ id, cycleId }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');
  const data = await getProjectData(id, session.user.id);
  if (!data) notFound();
  const cycle = await getCycle(id, cycleId);
  if (!cycle) notFound();

  const [issues, history, next, cookieStore] = await Promise.all([
    queryIssues(
      and(
        eq(tickets.projectId, id),
        eq(tickets.cycleId, cycle.id),
        activeIssue(),
        memberOfIssueProject(session.user.id),
      ),
    ),
    loadCycleHistory(id),
    cycle.completedAt ? null : findNextCycle(id, cycle),
    cookies(),
  ]);

  const now = new Date();
  const status = cycleStatus(cycle, now);
  const totals = cycleTotals(history, cycle, now);
  const estimatesEnabled = data.project.estimateScale !== 'none';
  const canWrite = roleAllows(data.project.role, 'write');

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <CycleHeader
        projectId={id}
        cycle={{
          id: cycle.id,
          number: cycle.number,
          name: cycle.name,
          description: cycle.description,
          startsAt: cycle.startsAt,
          endsAt: cycle.endsAt,
          completedAt: cycle.completedAt,
        }}
        status={status}
        progress={percent(totals.completed, totals.scope)}
        unfinished={issues.filter((i) => !isClosed(i.state.type)).length}
        nextCycleName={next ? cycleName(next) : null}
        canWrite={canWrite}
      />

      <div className="flex flex-col gap-3">
        <CycleProgressBar totals={totals} className="max-w-xl" />
        <CycleStats totals={totals} showPoints={estimatesEnabled} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <BurndownChart
          cycle={{ startsAt: cycle.startsAt, endsAt: cycle.endsAt }}
          points={cycleBurndown(history, cycle, now)}
          estimatesEnabled={estimatesEnabled}
        />
        <CycleBreakdown issues={issues} estimatesEnabled={estimatesEnabled} />
      </div>

      <IssuesView
        issues={issues}
        defaultView={cookieStore.get(VIEW_COOKIE)?.value}
        createDefaults={{ cycleId: cycle.id }}
      />
    </div>
  );
}
