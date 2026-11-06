// Settings → Recurring issues. Membership is checked first (non-members 404);
// the actions re-check the write role. Due occurrences of this project are
// created before rendering, so schedules keep working (and the list is
// current) even when the daily cron isn't configured.

import { roleAllows } from '@/lib/roles';
import {
  getProjectRecurringIssues,
  runDueRecurringIssues,
  toRecurringIssue,
} from '@/lib/recurring';
import { loadViewerProject } from '../../project-load';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const { id } = params;
  const { project: membership } = await loadViewerProject(id);

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
