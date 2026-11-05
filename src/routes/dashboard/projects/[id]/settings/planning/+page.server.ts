// Settings → Cycles & triage. Membership is checked first (non-members 404);
// the save action re-checks the admin role.

import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

import { projects } from '@/db/schema';
import { getProjectCycles } from '@/lib/cycles';
import { db } from '@/lib/db';
import { getMemberProject } from '@/lib/project-access';
import { roleAllows } from '@/lib/roles';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const { id } = params;
  if (!locals.user) redirect(303, '/login');
  const membership = await getMemberProject(id, locals.user.id);
  if (!membership) error(404, 'Not found');

  const [[project], cycleRows] = await Promise.all([
    db
      .select({
        cyclesEnabled: projects.cyclesEnabled,
        durationWeeks: projects.cycleDurationWeeks,
        startWeekday: projects.cycleStartWeekday,
        cooldownWeeks: projects.cycleCooldownWeeks,
        autoCreate: projects.cycleAutoCreate,
        autoRollover: projects.cycleAutoRollover,
        triageEnabled: projects.triageEnabled,
      })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1),
    getProjectCycles(id),
  ]);
  if (!project) error(404, 'Not found');

  return {
    projectId: id,
    initial: project,
    canEdit: roleAllows(membership.role, 'admin'),
    hasCycles: cycleRows.length > 0,
  };
};
