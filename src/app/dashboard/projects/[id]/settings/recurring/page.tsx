// Settings → Recurring issues. Membership is checked first (non-members 404);
// the actions re-check the write role. Due occurrences of this project are
// created before rendering, so schedules keep working (and the list is
// current) even when the daily cron isn't configured.

import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { getSession } from '@/lib/session';
import { getMemberProject } from '@/lib/project-access';
import { roleAllows } from '@/lib/roles';
import {
  getProjectRecurringIssues,
  runDueRecurringIssues,
  toRecurringIssue,
} from '@/lib/recurring';
import { RecurringSettings } from '@/components/recurring/recurring-settings';

export const metadata: Metadata = { title: 'Recurring issues' };

export default async function RecurringSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, session] = await Promise.all([params, getSession()]);
  if (!session?.user) redirect('/login');
  const membership = await getMemberProject(id, session.user.id);
  if (!membership) notFound();

  try {
    await runDueRecurringIssues(new Date(), id);
  } catch (err) {
    // The list still renders; the cron (or the next visit) retries.
    console.error('[recurring] lazy run failed', err);
  }
  const rows = await getProjectRecurringIssues(id);

  return (
    <>
      <h1 className="text-xl font-medium">Recurring issues</h1>
      <p className="mt-1 mb-8 text-sm text-muted-foreground">
        Issues created automatically on a schedule. Runs happen once a day (UTC); a missed run
        creates one issue, not a backlog.
      </p>
      <RecurringSettings
        projectId={id}
        items={rows.map(toRecurringIssue)}
        canEdit={roleAllows(membership.role, 'write')}
        cronConfigured={Boolean(process.env.CRON_SECRET)}
      />
    </>
  );
}
