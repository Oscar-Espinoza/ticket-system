// Cycles list. The project layout already checked membership (non-members 404)
// and provides project data; the cycle reads below are scoped by project id.

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { IterationCw } from 'lucide-react';

import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { getSession } from '@/lib/session';
import { getProjectData } from '@/lib/project-data';
import { roleAllows } from '@/lib/roles';
import { cycleTotals, getProjectCycles, loadCycleHistory } from '@/lib/cycles';
import { CyclesList, type CycleListItem } from '@/components/cycles/cycles-list';
import { FeatureOffState } from '@/components/cycles/feature-off';
import {
  DAY_MS,
  cycleCapacity,
  cycleName,
  cycleStatus,
  utcDay,
} from '@/components/cycles/cycle-utils';

export const metadata: Metadata = { title: 'Cycles' };

/** Past cycles shown in the velocity chart. */
const VELOCITY_CYCLES = 8;

export default async function CyclesPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');
  const data = await getProjectData(id, session.user.id);
  if (!data) notFound();
  const { project } = data;

  if (!project.cyclesEnabled && data.cycles.length === 0) {
    return (
      <FeatureOffState
        projectId={id}
        icon={<IterationCw />}
        title="Cycles are off"
        description="Plan work in time-boxed iterations with progress, burndown and velocity."
        canEnable={roleAllows(project.role, 'admin')}
      />
    );
  }

  const [rows, history, [settings]] = await Promise.all([
    getProjectCycles(id),
    loadCycleHistory(id),
    db
      .select({
        durationWeeks: projects.cycleDurationWeeks,
        cooldownWeeks: projects.cycleCooldownWeeks,
      })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1),
  ]);
  const now = new Date();
  const items: CycleListItem[] = rows.map((row) => ({
    id: row.id,
    number: row.number,
    name: row.name,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    completedAt: row.completedAt,
    status: cycleStatus(row, now),
    totals: cycleTotals(history, row, now),
  }));

  const past = items.filter((c) => c.status === 'past');
  const lastEnd = rows.length ? Math.max(...rows.map((r) => r.endsAt.getTime())) : 0;
  const cooldownWeeks = settings?.cooldownWeeks ?? 0;
  const start = Math.max(
    lastEnd ? lastEnd + cooldownWeeks * 7 * DAY_MS : 0,
    utcDay(now).getTime(),
  );
  const duration = (settings?.durationWeeks ?? 2) * 7 * DAY_MS;

  return (
    <CyclesList
      projectId={id}
      current={items.find((c) => c.status === 'current') ?? null}
      upcoming={items.filter((c) => c.status === 'upcoming')}
      past={[...past].reverse()}
      velocity={past.slice(-VELOCITY_CYCLES).map((c) => ({
        id: c.id,
        label: `C${c.number}`,
        name: cycleName(c),
        totals: c.totals,
      }))}
      capacity={cycleCapacity(past.map((c) => c.totals))}
      cooldownWeeks={cooldownWeeks}
      estimatesEnabled={project.estimateScale !== 'none'}
      canWrite={roleAllows(project.role, 'write') && project.cyclesEnabled}
      suggested={{ startsAt: new Date(start), endsAt: new Date(start + duration) }}
    />
  );
}
