// Settings → Recurring issues. Membership is checked first (non-members 404);
// the actions re-check the write role. Due occurrences of this project are
// created before rendering, so schedules keep working (and the list is
// current) even when the daily cron isn't configured.

import { error, redirect } from '@sveltejs/kit';

import { getSession } from '@/lib/session';
import { getMemberProject } from '@/lib/project-access';
import { roleAllows } from '@/lib/roles';
import {
  getProjectRecurringIssues,
  runDueRecurringIssues,
  toRecurringIssue,
} from '@/lib/recurring';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const { id } = params;
  const session = await getSession();
  if (!session?.user) redirect(303, '/login');
  const membership = await getMemberProject(id, session.user.id);
  if (!membership) error(404, 'Not found');

  try {
    await runDueRecurringIssues(new Date(), id);
  } catch (err) {
    // The list still renders; the cron (or the next visit) retries.
    console.error('[recurring] lazy run failed', err);
  }
  const rows = await getProjectRecurringIssues(id);

  return {
    projectId: id,
    items: rows.map(toRecurringIssue),
    canEdit: roleAllows(membership.role, 'write'),
    cronConfigured: Boolean(process.env.CRON_SECRET),
  };
};
