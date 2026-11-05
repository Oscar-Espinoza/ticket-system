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

/** A job still running after this is reported and the next job starts. */
export const JOB_TIMEOUT_MS = 10 * 60_000;

function withTimeout<T>(work: Promise<T>, ms: number, name: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${name} still running after ${ms} ms`)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export async function runDailyJobs(
  now = new Date(),
  jobs: Record<string, (now: Date) => Promise<string>> = JOBS,
  timeoutMs = JOB_TIMEOUT_MS,
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  for (const [name, job] of Object.entries(jobs)) {
    try {
      results[name] = await withTimeout(job(now), timeoutMs, name);
    } catch (err) {
      console.error(`[cron] ${name} failed`, err);
      results[name] = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return results;
}
