// Archived issues of a project (not in the trash), most recently archived
// first. The project layout already verified membership; the query is
// membership-gated too.

import { getArchivedIssues } from '@/lib/issue-lists-read';
import { requireUser } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const user = await requireUser();
  return { issues: await getArchivedIssues(params.id, user.id) };
};
