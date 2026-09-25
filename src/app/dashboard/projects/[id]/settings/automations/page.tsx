// Settings → Automations. Membership is checked first (non-members 404); the
// save action re-checks the admin role.

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { getSession } from '@/lib/session';
import { getMemberProject } from '@/lib/project-access';
import { roleAllows } from '@/lib/roles';
import { AutomationSettingsForm } from '@/components/cycles/automation-settings-form';

export const metadata: Metadata = { title: 'Automations' };

export default async function AutomationSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');
  const membership = await getMemberProject(id, session.user.id);
  if (!membership) notFound();

  const [project] = await db
    .select({
      autoArchiveMonths: projects.autoArchiveMonths,
      autoCloseMonths: projects.autoCloseMonths,
      automationRunAt: projects.automationRunAt,
    })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  if (!project) notFound();

  return (
    <>
      <h1 className="text-xl font-medium">Automations</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        Keep the backlog tidy. Automations run at most once a day, when someone opens the project.
      </p>
      <AutomationSettingsForm
        projectId={id}
        initial={{
          autoArchiveMonths: project.autoArchiveMonths,
          autoCloseMonths: project.autoCloseMonths,
        }}
        lastRunAt={project.automationRunAt}
        canEdit={roleAllows(membership.role, 'admin')}
      />
    </>
  );
}
