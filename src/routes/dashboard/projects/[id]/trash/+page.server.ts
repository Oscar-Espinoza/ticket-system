// Trashed (soft-deleted) issues of a project, most recently deleted first.
// Items are purged 30 days after deletion by the project automations.

import { getTrashedIssues } from '@/lib/issue-lists-read';
import { requireUser } from '@/lib/session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const user = await requireUser();
  return { issues: await getTrashedIssues(params.id, user.id) };
};
