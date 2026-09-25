// Settings → SLAs. Membership is checked first (non-members 404); the save
// actions re-check the admin role.

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { getSession } from '@/lib/session';
import { getMemberProject } from '@/lib/project-access';
import { roleAllows } from '@/lib/roles';
import { normalizeSlaPolicy } from '@/lib/sla';
import { SlaSettingsForm } from '@/components/sla/sla-settings-form';

export const metadata: Metadata = { title: 'SLAs' };

export default async function SlaSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');
  const membership = await getMemberProject(id, session.user.id);
  if (!membership) notFound();

  const [project] = await db
    .select({ slaPolicy: projects.slaPolicy })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  if (!project) notFound();

  return (
    <>
      <h1 className="text-xl font-medium">SLAs</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        Response targets by priority. Issues show the time left, turn red once overdue, and the
        assignee and subscribers are notified when an SLA is breached.
      </p>
      <SlaSettingsForm
        projectId={id}
        initial={normalizeSlaPolicy(project.slaPolicy) ?? {}}
        canEdit={roleAllows(membership.role, 'admin')}
      />
    </>
  );
}
