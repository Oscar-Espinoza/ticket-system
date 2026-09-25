// Daily cron job (D5): create due recurring issues (recurring_issue.nextRunAt
// <= now). Idempotent — each occurrence is claimed before its issue is created
// (see src/lib/recurring.ts), so a retried run never duplicates issues.

import { runDueRecurringIssues } from '@/lib/recurring';

export async function run(now: Date): Promise<string> {
  const { created, failed } = await runDueRecurringIssues(now);
  return `created ${created} issues${failed ? `, ${failed} failed (retried next run)` : ''}`;
}
