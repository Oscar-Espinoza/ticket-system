import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';

import { getSession } from '@/lib/session';
import { getMemberProject } from '@/lib/project-access';
import { db } from '@/lib/db';
import { projects } from '@/db/schema';
import { roleAllows } from '@/lib/roles';
import { ProjectGeneralForm } from '@/components/settings/project-general-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  const project = session?.user ? await getMemberProject(id, session.user.id) : null;
  return { title: project ? `Settings · ${project.name}` : 'Project not found' };
}

export default async function ProjectGeneralSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');

  // Membership first (D-13), then the project's editable columns.
  const membership = await getMemberProject(id, session.user.id);
  if (!membership) notFound();
  const [project] = await db
    .select({
      name: projects.name,
      ticketKey: projects.ticketKey,
      description: projects.description,
      estimateScale: projects.estimateScale,
    })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  if (!project) notFound();

  return (
    <>
      <h1 className="text-xl font-medium">General</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        Name, issue key and defaults for this project.
      </p>
      <ProjectGeneralForm
        projectId={id}
        name={project.name}
        ticketKey={project.ticketKey}
        description={project.description ?? ''}
        estimateScale={project.estimateScale}
        canEdit={roleAllows(membership.role, 'admin')}
        isOwner={membership.role === 'owner'}
      />
    </>
  );
}
