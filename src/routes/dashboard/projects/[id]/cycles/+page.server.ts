// Cycles list. The project layout already checked membership (non-members 404)
// and provides project data; the cycle reads below are scoped by project id.

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { roleAllows } from '@/lib/roles';
import { cycleTotals, getProjectCycles, loadCycleHistory } from '@/lib/cycles';
import type { CycleListItem } from '@/lib/components/cycles/cycles-list.svelte';
import {
  DAY_MS,
  cycleCapacity,
  cycleName,
  cycleStatus,
  utcDay,
} from '@/lib/cycle-utils';
import type { PageServerLoad } from './$types';

/** Past cycles shown in the velocity chart. */
const VELOCITY_CYCLES = 8;

export const load: PageServerLoad = async ({ params, parent }) => {
  const { id } = params;
  const data = (await parent()).projectData;
  const { project } = data;

  if (!project.cyclesEnabled && data.cycles.length === 0) {
    return {
      featureOff: true as const,
      projectId: id,
      canEnable: roleAllows(project.role, 'admin'),
    };
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

  return {
    featureOff: false as const,
    projectId: id,
    current: items.find((c) => c.status === 'current') ?? null,
    upcoming: items.filter((c) => c.status === 'upcoming'),
    past: [...past].reverse(),
    velocity: past.slice(-VELOCITY_CYCLES).map((c) => ({
      id: c.id,
      label: `C${c.number}`,
      name: cycleName(c),
      totals: c.totals,
    })),
    capacity: cycleCapacity(past.map((c) => c.totals)),
    cooldownWeeks,
    estimatesEnabled: project.estimateScale !== 'none',
    canWrite: roleAllows(project.role, 'write') && project.cyclesEnabled,
    suggested: { startsAt: new Date(start), endsAt: new Date(start + duration) },
  };
};
