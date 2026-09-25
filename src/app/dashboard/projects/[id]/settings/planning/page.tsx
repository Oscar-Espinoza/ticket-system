// Settings → Cycles & triage. Membership is checked first (non-members 404);
// the save action re-checks the admin role.

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { getSession } from '@/lib/session';
import { getMemberProject } from '@/lib/project-access';
import { roleAllows } from '@/lib/roles';
import { getProjectCycles } from '@/lib/cycles';
import { PlanningSettingsForm } from '@/components/cycles/planning-settings-form';

export const metadata: Metadata = { title: 'Cycles & triage' };

export default async function PlanningSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');
  const membership = await getMemberProject(id, session.user.id);
  if (!membership) notFound();

  const [[project], cycleRows] = await Promise.all([
    db
      .select({
        cyclesEnabled: projects.cyclesEnabled,
        durationWeeks: projects.cycleDurationWeeks,
        startWeekday: projects.cycleStartWeekday,
        autoCreate: projects.cycleAutoCreate,
        autoRollover: projects.cycleAutoRollover,
        triageEnabled: projects.triageEnabled,
      })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1),
    getProjectCycles(id),
  ]);
  if (!project) notFound();

  return (
    <>
      <h1 className="text-xl font-medium">Cycles &amp; triage</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        How this project plans work and reviews incoming issues.
      </p>
      <PlanningSettingsForm
        projectId={id}
        initial={project}
        canEdit={roleAllows(membership.role, 'admin')}
        hasCycles={cycleRows.length > 0}
      />
    </>
  );
}
