// Daily jobs, run by /api/cron/daily (Vercel Hobby allows one cron a day).
// Each job lives in its own file under ./jobs and owns its failures; one
// failing job never stops the others.

import { run as automations } from './jobs/automations';
import { run as recurring } from './jobs/recurring';
import { run as sla } from './jobs/sla';
import { run as digests } from './jobs/digests';
import { run as pulse } from './jobs/pulse';
import { run as webhookRetries } from './jobs/webhook-retries';
import { run as collabPrune } from './jobs/collab-prune';

const JOBS: Record<string, (now: Date) => Promise<string>> = {
  automations,
  recurring,
  sla,
  digests,
  pulse,
  webhookRetries,
  collabPrune,
};

export async function runDailyJobs(now = new Date()): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  for (const [name, job] of Object.entries(JOBS)) {
    try {
      results[name] = await job(now);
    } catch (err) {
      console.error(`[cron] ${name} failed`, err);
      results[name] = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return results;
}
