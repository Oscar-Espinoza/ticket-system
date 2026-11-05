// Triage page. The project layout already checked membership; getProjectIssues
// is membership-gated in SQL too (and shared with the duplicate search).

import { error, redirect } from '@sveltejs/kit';

import { getSession } from '@/lib/session';
import { getProjectData } from '@/lib/project-data';
import { getProjectIssues } from '@/lib/tickets';
import { roleAllows } from '@/lib/roles';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const { id } = params;
  const session = await getSession();
  if (!session?.user) redirect(303, '/login');
  const [data, issues] = await Promise.all([
    getProjectData(id, session.user.id),
    getProjectIssues(id, session.user.id),
  ]);
  if (!data) error(404, 'Not found');

  // getProjectIssues is newest first already.
  const triage = issues.filter((issue) => issue.state.type === 'triage');
  if (!data.project.triageEnabled && triage.length === 0) {
    return {
      featureOff: true as const,
      projectId: id,
      canEnable: roleAllows(data.project.role, 'admin'),
    };
  }

  return { featureOff: false as const, projectId: id, issues: triage, candidates: issues };
};
