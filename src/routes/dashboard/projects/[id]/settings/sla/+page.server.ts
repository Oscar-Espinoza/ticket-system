// Settings → SLAs. Membership is checked first (non-members 404); the save
// actions re-check the admin role.

import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

import { projects } from '@/db/schema';
import { db } from '@/lib/db';
import { getMemberProject } from '@/lib/project-access';
import { roleAllows } from '@/lib/roles';
import { normalizeSlaPolicy } from '@/lib/sla';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
  const { id } = params;
  if (!locals.user) redirect(303, '/login');
  const membership = await getMemberProject(id, locals.user.id);
  if (!membership) error(404, 'Not found');

  const [project] = await db
    .select({ slaPolicy: projects.slaPolicy })
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  if (!project) error(404, 'Not found');

  return {
    projectId: id,
    initial: normalizeSlaPolicy(project.slaPolicy) ?? {},
    canEdit: roleAllows(membership.role, 'admin'),
  };
};
