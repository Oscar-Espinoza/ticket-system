// Cycle page: header, progress, burndown, breakdown and the cycle's issues.
// The project layout already checked membership; the cycle is looked up by
// (project id, cycle id) and the issue read is membership-gated in SQL too.

import { error, redirect } from '@sveltejs/kit';
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
  getProjectCycles,
  loadCycleHistory,
} from '@/lib/cycles';
import { cycleCapacity, cycleName, cycleStatus, percent } from '@/components/cycles/cycle-utils';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, cookies }) => {
  const { id, cycleId } = params;
  const session = await getSession();
  if (!session?.user) redirect(303, '/login');
  const data = await getProjectData(id, session.user.id);
  if (!data) error(404, 'Not found');
  const cycle = await getCycle(id, cycleId);
  if (!cycle) error(404, 'Not found');

  const [issues, history, next, allCycles] = await Promise.all([
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
    getProjectCycles(id),
  ]);

  const now = new Date();
  const status = cycleStatus(cycle, now);
  const totals = cycleTotals(history, cycle, now);
  const estimatesEnabled = data.project.estimateScale !== 'none';
  const canWrite = roleAllows(data.project.role, 'write');
  // Only plans (current / upcoming) are measured against recent throughput.
  const capacity =
    status === 'past'
      ? null
      : cycleCapacity(
          allCycles
            .filter((c) => c.id !== cycle.id && cycleStatus(c, now) === 'past')
            .map((c) => cycleTotals(history, c, now)),
        );

  return {
    projectId: id,
    title: cycleName(cycle),
    cycle: {
      id: cycle.id,
      number: cycle.number,
      name: cycle.name,
      description: cycle.description,
      startsAt: cycle.startsAt,
      endsAt: cycle.endsAt,
      completedAt: cycle.completedAt,
    },
    status,
    progress: percent(totals.completed, totals.scope),
    unfinished: issues.filter((i) => !isClosed(i.state.type)).length,
    nextCycleName: next ? cycleName(next) : null,
    canWrite,
    totals,
    estimatesEnabled,
    capacity,
    burndown: cycleBurndown(history, cycle, now),
    issues,
    defaultView: cookies.get(VIEW_COOKIE),
  };
};
