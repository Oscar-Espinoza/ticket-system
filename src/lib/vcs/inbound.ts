// Durable processing of verified GitHub / GitLab / Bitbucket webhook
// deliveries. Server-only.
//
// A route that verified a delivery records it here (one row per delivery and
// project) BEFORE answering 202, then processes it after the response. If that
// processing fails (a DB blip) or never finishes (the function was cut off),
// the row stays due and a later runner retries it: lazily after the next
// delivery, and from the daily cron. The 202 therefore means "stored", not
// "done", and nothing depends on the provider redelivering: GitHub never
// retries a failed delivery on its own, and a 2xx stops any provider's retry.
// If the row cannot be stored the route answers 500 instead.
//
// Rows are claimed atomically (next_attempt_at moves past the lease), so a
// row runs on one runner at a time. The handlers are idempotent by state (PR
// links and their events: vcs/automation.ts; issue moves skip issues already
// there), so a retry after a partial run finishes the work without repeating
// what was done. Failed rows back off like outgoing webhooks and give up after
// MAX_ATTEMPTS.

import { and, eq, inArray, isNotNull, isNull, lt, lte, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { projects, vcsWebhookDeliveries } from '@/db/schema';
import { MAX_ATTEMPTS, nextRetryAt } from '@/lib/integrations/outgoing-webhooks';
import {
  syncCheckRun,
  syncCheckSuite,
  syncPullRequest,
  syncPullRequestReview,
  syncPush,
  syncStatus,
  type SyncProject,
} from '@/lib/github/sync';
import { syncGitlabHook, type GitlabHook } from '@/lib/vcs/gitlab-sync';
import { syncBitbucketEvent } from '@/lib/vcs/bitbucket-sync';
import { getWebhookIntegration, type BitbucketConfig, type GitlabConfig } from '@/lib/vcs/integrations';
import { decryptToken } from '@/lib/server/crypto';
import { vcsProjectColumns } from '@/lib/vcs/project';
import { MINUTE_MS } from '@/lib/time';

export type InboundProvider = 'github' | 'gitlab' | 'bitbucket';

/** A claimed row is retried after this if its runner dies mid-processing. */
const LEASE_MS = 5 * MINUTE_MS;
/** Processed rows are kept this long (redeliveries within it are recognised). */
const KEEP_PROCESSED_MS = 3 * 24 * 60 * MINUTE_MS;
/** Rows that gave up are kept this long for inspection. */
const KEEP_FAILED_MS = 30 * 24 * 60 * MINUTE_MS;
const ERROR_MAX = 500;

/** Each GitHub handler reads only the payload fields it declares (GitHub's shapes). */
const GITHUB_HANDLERS: Record<string, (project: SyncProject, payload: never) => Promise<void>> = {
  pull_request: syncPullRequest,
  push: syncPush,
  pull_request_review: syncPullRequestReview,
  check_suite: syncCheckSuite,
  check_run: syncCheckRun,
  status: syncStatus,
};
const GITLAB_EVENTS = new Set(['Merge Request Hook', 'Push Hook', 'Pipeline Hook']);

/** Whether this app acts on `event` from `provider` (others are answered and dropped). */
export function handlesEvent(provider: InboundProvider, event: string): boolean {
  if (provider === 'github') return Object.hasOwn(GITHUB_HANDLERS, event);
  if (provider === 'gitlab') return GITLAB_EVENTS.has(event);
  return event.startsWith('pullrequest:') || event === 'repo:push' || event.startsWith('repo:commit_status_');
}

const githubProjectColumns = { ...vcsProjectColumns, githubConnectedById: projects.githubConnectedById };

type Row = typeof vcsWebhookDeliveries.$inferSelect;

/** Run one delivery's handler. Throws when the work failed (the row is retried). */
async function processRow(row: Row): Promise<void> {
  if (row.provider === 'github') {
    const handler = Object.hasOwn(GITHUB_HANDLERS, row.event) ? GITHUB_HANDLERS[row.event] : null;
    if (!handler) return;
    const [project] = await db
      .select(githubProjectColumns)
      .from(projects)
      .where(eq(projects.id, row.projectId))
      .limit(1);
    if (!project) return; // disconnected / deleted since: nothing to do
    await handler(project, row.payload as never);
    return;
  }
  if (!row.integrationId) return;
  if (row.provider === 'gitlab') {
    const found = await getWebhookIntegration<GitlabConfig>(row.integrationId, 'gitlab');
    if (!found || found.project.id !== row.projectId) return;
    await syncGitlabHook(found.project, found.integration.config, row.payload as GitlabHook);
    return;
  }
  if (row.provider === 'bitbucket') {
    const found = await getWebhookIntegration<BitbucketConfig>(row.integrationId, 'bitbucket');
    if (!found || found.project.id !== row.projectId) return;
    const token = await decryptToken(found.integration.token);
    const auth = token ? { token, username: found.integration.config.username ?? null } : null;
    await syncBitbucketEvent(found.project, found.integration.config, row.event, row.payload, auth);
  }
}

/** Process rows this runner holds (claimed or just recorded). Never throws. */
async function processRows(rows: Row[]): Promise<void> {
  for (const row of rows) {
    const attempts = row.attempts + 1;
    try {
      await processRow(row);
      await db
        .update(vcsWebhookDeliveries)
        .set({ attempts, processedAt: new Date(), nextAttemptAt: null, error: null })
        .where(eq(vcsWebhookDeliveries.id, row.id));
    } catch (err) {
      console.error(`[vcs-inbound] ${row.provider} ${row.event} delivery ${row.deliveryId} failed (attempt ${attempts})`, err);
      const message = (err instanceof Error ? err.message : String(err)).slice(0, ERROR_MAX);
      try {
        await db
          .update(vcsWebhookDeliveries)
          .set({ attempts, error: message, nextAttemptAt: nextRetryAt(attempts) })
          .where(eq(vcsWebhookDeliveries.id, row.id));
      } catch (markErr) {
        // The lease still expires: the row is retried after it.
        console.error('[vcs-inbound] could not record the failure', markErr);
      }
    }
  }
}

export interface InboundDelivery {
  provider: InboundProvider;
  /** The provider's delivery id header, if any. */
  deliveryId: string | null;
  event: string;
  payload: unknown;
  /** One row per project the delivery was verified for. */
  targets: { projectId: string; integrationId?: string | null }[];
}

/**
 * Store a verified delivery (leased to the caller) and return the new rows.
 * A delivery id already stored for a project (a provider redelivery) is
 * skipped. Throws when the rows cannot be stored: the route must not answer
 * 2xx then.
 */
export async function recordInbound(delivery: InboundDelivery): Promise<Row[]> {
  if (!delivery.targets.length) return [];
  const now = new Date();
  const given = delivery.deliveryId?.trim().slice(0, 200);
  const deliveryId = given || crypto.randomUUID();
  return db
    .insert(vcsWebhookDeliveries)
    .values(
      delivery.targets.map((target) => ({
        id: crypto.randomUUID(),
        provider: delivery.provider,
        deliveryId,
        projectId: target.projectId,
        integrationId: target.integrationId ?? null,
        event: delivery.event,
        payload: delivery.payload ?? {},
        attempts: 0,
        nextAttemptAt: new Date(now.getTime() + LEASE_MS),
        createdAt: now,
      })),
    )
    .onConflictDoNothing({
      target: [vcsWebhookDeliveries.provider, vcsWebhookDeliveries.deliveryId, vcsWebhookDeliveries.projectId],
    })
    .returning();
}

/**
 * Claim up to `limit` due rows (unfinished past their lease, or failed and due
 * again) and process them. Returns how many were claimed. Never throws.
 */
export async function retryInbound(options: { limit?: number; now?: Date } = {}): Promise<number> {
  const now = options.now ?? new Date();
  try {
    const due = db
      .select({ id: vcsWebhookDeliveries.id })
      .from(vcsWebhookDeliveries)
      .where(
        and(
          isNotNull(vcsWebhookDeliveries.nextAttemptAt),
          lte(vcsWebhookDeliveries.nextAttemptAt, now),
          lt(vcsWebhookDeliveries.attempts, MAX_ATTEMPTS),
        ),
      )
      .orderBy(vcsWebhookDeliveries.nextAttemptAt)
      .limit(options.limit ?? 20)
      .for('update', { skipLocked: true });
    // The claim re-checks due-ness, so two runners never both take a row.
    const claimed = await db
      .update(vcsWebhookDeliveries)
      .set({ nextAttemptAt: new Date(now.getTime() + LEASE_MS) })
      .where(and(inArray(vcsWebhookDeliveries.id, due), lte(vcsWebhookDeliveries.nextAttemptAt, now)))
      .returning();
    await processRows(claimed);
    return claimed.length;
  } catch (err) {
    console.error('[vcs-inbound] retry sweep failed', err);
    return 0;
  }
}

/** After the response: process the rows just recorded, then a few due ones. */
export async function processInbound(rows: Row[]): Promise<void> {
  await processRows(rows);
  await retryInbound({ limit: 5 });
}

/** Drop finished rows past their retention. Returns how many. */
export async function pruneInbound(now = new Date()): Promise<number> {
  const processed = and(
    isNotNull(vcsWebhookDeliveries.processedAt),
    lt(vcsWebhookDeliveries.processedAt, new Date(now.getTime() - KEEP_PROCESSED_MS)),
  );
  const gaveUp = and(
    isNull(vcsWebhookDeliveries.processedAt),
    sql`${vcsWebhookDeliveries.attempts} >= ${MAX_ATTEMPTS}`,
    lt(vcsWebhookDeliveries.createdAt, new Date(now.getTime() - KEEP_FAILED_MS)),
  );
  const removed = await db
    .delete(vcsWebhookDeliveries)
    .where(sql`(${processed}) or (${gaveUp})`)
    .returning({ id: vcsWebhookDeliveries.id });
  return removed.length;
}
