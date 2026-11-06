// Settings → SLAs. Membership is checked first (non-members 404); the save
// actions re-check the admin role.

import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

import { projects } from '@/db/schema';
import { db } from '@/lib/db';
import { roleAllows } from '@/lib/roles';
import { normalizeSlaPolicy } from '@/lib/sla';
import { loadViewerProject } from '../../project-load';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const { id } = params;
  const { project: membership } = await loadViewerProject(id);

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
