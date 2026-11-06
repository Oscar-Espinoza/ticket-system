// Triage page. The project layout already checked membership; getProjectIssues
// is membership-gated in SQL too (and shared with the duplicate search).

import { requireUser } from '@/lib/session';
import { getProjectIssues } from '@/lib/tickets';
import { roleAllows } from '@/lib/roles';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent }) => {
  const { id } = params;
  const user = await requireUser();
  const [{ projectData: data }, issues] = await Promise.all([
    parent(),
    getProjectIssues(id, user.id),
  ]);

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
