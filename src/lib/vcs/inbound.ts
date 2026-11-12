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
// row runs on one runner at a time. Every claim counts as an attempt (the
// route's own lease is the first), so a delivery whose runner is cut off every
// time also stops after MAX_ATTEMPTS. The handlers are idempotent by state (PR
// links and their events: vcs/automation.ts; issue moves skip issues already
// there), so a retry after a partial run finishes the work without repeating
// what was done. Failed rows back off like outgoing webhooks and give up after
// MAX_ATTEMPTS.

import { and, eq, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm';

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

/**
 * The row while this runner still holds the lease it took: same attempt count
 * and lease end. A run that outlived its lease was superseded by a later claim
 * (or a restart), and its final write must change nothing.
 */
const stillHeld = (row: Row) =>
  and(
    eq(vcsWebhookDeliveries.id, row.id),
    eq(vcsWebhookDeliveries.attempts, row.attempts),
    row.nextAttemptAt ? eq(vcsWebhookDeliveries.nextAttemptAt, row.nextAttemptAt) : undefined,
    isNull(vcsWebhookDeliveries.processedAt),
  );

/** Process rows this runner holds (claimed or just recorded). Never throws. */
async function processRows(rows: Row[]): Promise<void> {
  for (const row of rows) {
    // Counted when the row was leased (recordInbound / the claim).
    const attempts = row.attempts;
    try {
      await processRow(row);
      await db
        .update(vcsWebhookDeliveries)
        .set({ processedAt: new Date(), nextAttemptAt: null, error: null })
        .where(stillHeld(row));
    } catch (err) {
      console.error(`[vcs-inbound] ${row.provider} ${row.event} delivery ${row.deliveryId} failed (attempt ${attempts})`, err);
      const message = (err instanceof Error ? err.message : String(err)).slice(0, ERROR_MAX);
      try {
        await db
          .update(vcsWebhookDeliveries)
          .set({ error: message, nextAttemptAt: nextRetryAt(attempts) })
          .where(stillHeld(row));
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

/** Stored rows that gave up: never processed, out of attempts. */
const gaveUp = () =>
  and(isNull(vcsWebhookDeliveries.processedAt), sql`${vcsWebhookDeliveries.attempts} >= ${MAX_ATTEMPTS}`);

/** Given up and not leased: its last attempt is not still running. */
const gaveUpIdle = (now: Date) =>
  and(
    gaveUp(),
    or(isNull(vcsWebhookDeliveries.nextAttemptAt), lte(vcsWebhookDeliveries.nextAttemptAt, now)),
  );

/**
 * Store a verified delivery (leased to the caller: its first attempt) and
 * return the rows to process now. A delivery id already stored for a project
 * (a provider redelivery) is skipped while that row is processed or pending;
 * a row that gave up is started over (a manual "Redeliver" after an outage). Throws when the rows cannot be stored: the route must not answer
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
        attempts: 1,
        nextAttemptAt: new Date(now.getTime() + LEASE_MS),
        createdAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [vcsWebhookDeliveries.provider, vcsWebhookDeliveries.deliveryId, vcsWebhookDeliveries.projectId],
      set: {
        payload: sql`excluded.payload`,
        attempts: 1,
        nextAttemptAt: new Date(now.getTime() + LEASE_MS),
        error: null,
      },
      // Not while its last attempt still runs: that run and this one would
      // process the delivery at once.
      setWhere: gaveUpIdle(now),
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
    // Out of attempts and its last lease expired (the runner was cut off):
    // given up, like a row whose last attempt failed.
    await db
      .update(vcsWebhookDeliveries)
      .set({ nextAttemptAt: null, error: sql`coalesce(${vcsWebhookDeliveries.error}, 'gave up: no attempt finished')` })
      .where(and(gaveUp(), isNotNull(vcsWebhookDeliveries.nextAttemptAt), lte(vcsWebhookDeliveries.nextAttemptAt, now)));
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
      .set({ nextAttemptAt: new Date(now.getTime() + LEASE_MS), attempts: sql`${vcsWebhookDeliveries.attempts} + 1` })
      .where(
        and(
          inArray(vcsWebhookDeliveries.id, due),
          lte(vcsWebhookDeliveries.nextAttemptAt, now),
          lt(vcsWebhookDeliveries.attempts, MAX_ATTEMPTS),
        ),
      )
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
  const failed = and(gaveUp(), lt(vcsWebhookDeliveries.createdAt, new Date(now.getTime() - KEEP_FAILED_MS)));
  const removed = await db
    .delete(vcsWebhookDeliveries)
    .where(sql`(${processed}) or (${failed})`)
    .returning({ id: vcsWebhookDeliveries.id });
  return removed.length;
}
